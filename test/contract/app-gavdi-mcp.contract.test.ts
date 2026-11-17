import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { connectMcp, type McpClient } from "../helpers/mcp-client";
import { loginOf, resourcesChannel, toolsChannel } from "./mcp-client-channels";
import type { Reader } from "./server.contract";
import { hiddenContract, serverContract } from "./server.contract";

// Task 4.8: the fixture app test/fixtures/app-gavdi-mcp serves its bundle through @gavdi/cap-mcp
// on both channels (resources and tools), and a real MCP client (the official SDK, with its
// initialize handshake) runs the server contract on each. With the default requires, anonymous
// callers reach nothing, so the "no authorization section for anonymous readers" check can only
// fail in the requires: "any" runs (mcp-tools-anonymous, mcp-resources-anonymous).

const NAMESPACE = "okf-fixture";
const READER = { username: "reader", password: "reader" };
const EXPECTED = {
  reader: "authenticated" as const,
  concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
  curated: "guides/shipping.md",
  withAuthSection: ["model/AdminService/Books.md", "guides/shipping.md"],
};

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
});

describeWithGavdi("the @gavdi/cap-mcp fixture app, through a real MCP client", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-gavdi-mcp"));
  // cds.test sets url once the server listens; @cap-js/cds-test's types don't declare it.
  const clientFor = readerClients(() => (app as unknown as { url: string }).url);

  serverContract("MCP tools, real client", () => toolsChannel(clientFor), EXPECTED);
  hiddenContract("MCP tools, real client", () => toolsChannel(clientFor), EXPECTED.curated);
  serverContract(
    "MCP resources, real client",
    () => resourcesChannel(clientFor, NAMESPACE),
    EXPECTED,
  );
  hiddenContract(
    "MCP resources, real client",
    () => resourcesChannel(clientFor, NAMESPACE),
    EXPECTED.curated,
  );

  pluginOffers(clientFor);
  pluginAnswers(clientFor);
});

// One client per reader, connected on first use and closed after the tests.
function readerClients(serverUrl: () => string): (reader: Reader) => Promise<McpClient> {
  const clients = new Map<string, Promise<McpClient>>();
  afterAll(async () => {
    for (const client of clients.values()) await (await client).close();
  });
  return (reader) => {
    const login = loginOf(reader, READER);
    const key = login?.username ?? "anonymous";
    let client = clients.get(key);
    if (client === undefined) {
      client = connectMcp(serverUrl(), login);
      clients.set(key, client);
    }
    return client;
  };
}

// What an agent finds beyond the contract: the tools and the resources.
function pluginOffers(clientFor: (reader: Reader) => Promise<McpClient>): void {
  test("offers OkfService's five tools", async () => {
    const { tools } = await (await clientFor("authenticated")).listTools();
    const names = tools.map((tool) => tool.name).filter((name) => name.startsWith("OkfService_"));
    expect(names.sort()).toEqual([
      "OkfService_Index_get",
      "OkfService_Index_query",
      "OkfService_bundleInfo",
      "OkfService_getConcept",
      "OkfService_searchConcepts",
    ]);
  });

  test("offers the namespaced index resource and the concept template", async () => {
    const client = await clientFor("authenticated");
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain(`okf://${NAMESPACE}/index.md`);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates).toContainEqual(
      expect.objectContaining({
        uriTemplate: `okf://${NAMESPACE}/{+path}`,
        name: `okf-${NAMESPACE}-concepts`,
      }),
    );
  });
}

// Answers that tie the two channels together.
function pluginAnswers(clientFor: (reader: Reader) => Promise<McpClient>): void {
  test("bundleInfo names the namespace the resources use", async () => {
    const result = await (
      await clientFor("authenticated")
    ).callTool({
      name: "OkfService_bundleInfo",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      value: {
        okfVersion: "0.2",
        namespace: NAMESPACE,
        bundleHash: expect.stringMatching(/^sha256:/),
      },
    });
  });

  test("searchConcepts finds the curated guide", async () => {
    const result = await (
      await clientFor("authenticated")
    ).callTool({
      name: "OkfService_searchConcepts",
      arguments: { text: "shipping" },
    });
    const rows = (result.structuredContent as { value: { path: string }[] }).value;
    expect(rows.map((row) => row.path)).toContain("guides/shipping.md");
  });

  test("both channels give the same text for a concept", async () => {
    const tools = await toolsChannel(clientFor).read(EXPECTED.concept.path, "authenticated");
    const resources = await resourcesChannel(clientFor, NAMESPACE).read(
      EXPECTED.concept.path,
      "authenticated",
    );
    expect(tools).toEqual(resources);
    expect("text" in tools).toBe(true);
  });
}
