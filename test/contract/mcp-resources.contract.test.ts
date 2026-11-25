import path from "node:path";
import cds from "@sap/cds";
import { describeWithCommunity, COMMUNITY_PLUGIN } from "../helpers/community";
import { rpc } from "../helpers/mcp-rpc";
import { mcpResourcesChannel } from "./mcp-resources-channel";
import { BOB } from "./mcp-tools-channel";
import { hiddenContract, serverContract } from "./server.contract";

// The server contract (4.1) on the MCP resources channel (4.6), through @gavdi/cap-mcp v2 itself
// (the neighbouring checkout's lib/), on the demo app with cds.okf.serve.mcp: true, which is
// that plugin's default channels (resources and tools since ADR-0012), and the default requires
// (authenticated-user).

const NAMESPACE = "cap-okf-demo";
const INDEX = `okf://${NAMESPACE}/index.md`;
const TEMPLATE = `okf://${NAMESPACE}/{+path}`;

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: COMMUNITY_PLUGIN } },
  okf: { serve: { mcp: true } },
});

describeWithCommunity("the MCP resources channel through @gavdi/cap-mcp", () => {
  const { POST } = cds.test(path.join(__dirname, "..", "..", "demo"));
  const channel = () => mcpResourcesChannel(POST as never, NAMESPACE);

  serverContract("MCP resources", channel, {
    reader: "authenticated",
    concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
    curated: "guides/ordering.md",
    withAuthSection: ["model/AdminService/Orders.md", "guides/ordering.md"],
  });

  hiddenContract("MCP resources", channel, "guides/ordering.md");

  test("lists the index and the concept template to a caller who meets requires", async () => {
    const resources = await rpc(POST as never, BOB, "resources/list");
    expect(resources.message?.result?.["resources"]).toContainEqual(
      expect.objectContaining({ uri: INDEX, mimeType: "text/markdown" }),
    );
    const templates = await rpc(POST as never, BOB, "resources/templates/list");
    expect(templates.message?.result?.["resourceTemplates"]).toContainEqual(
      expect.objectContaining({ uriTemplate: TEMPLATE, name: `okf-${NAMESPACE}-concepts` }),
    );
  });

  test("hides the index from a caller who doesn't meet requires", async () => {
    const resources = await rpc(POST as never, undefined, "resources/list");
    // A real answer, so the check below can fail: the plugin lists what this caller may see.
    const listed = resources.message?.result?.["resources"] as { uri: string }[] | undefined;
    expect(Array.isArray(listed)).toBe(true);
    expect(listed?.map((resource) => resource.uri)).not.toContain(INDEX);
  });

  test("reads the index, and a folder it links to, for a caller who meets requires", async () => {
    const index = await channel().read("index.md", "authenticated");
    expect("text" in index && index.text).toContain("(model/)");
    const model = await rpc(POST as never, BOB, "resources/read", {
      uri: `okf://${NAMESPACE}/model/`,
    });
    const contents = model.message?.result?.["contents"] as { text: string }[] | undefined;
    expect(contents?.[0]?.text).toContain("CatalogService");
  });

  test("true serves both channels (ADR-0012): OkfService's tools are there too", async () => {
    const answer = await rpc(POST as never, BOB, "tools/list");
    const tools = (answer.message?.result?.["tools"] ?? []) as { name: string }[];
    const names = tools.map((tool) => tool.name).filter((name) => name.startsWith("OkfService_"));
    expect(names.sort()).toEqual([
      "OkfService_getConcept",
      "OkfService_getIndex",
      "OkfService_searchConcepts",
    ]);
  });
});
