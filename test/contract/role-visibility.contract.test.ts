import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { connectMcp, type Login, type McpClient } from "../helpers/mcp-client";

// ADR-0012 (amends ADR-0003): a curated note with `requires:` doesn't exist for a reader without
// one of its roles, on any surface: the tools (getIndex, searchConcepts, getConcept with one
// path or several, and its "Read together with" line), the resources (index.md, read, complete), the static route, the Index entity
// in-process, other concepts' links, and the "Business knowledge" section of generated concepts.
// Hidden and unknown paths give the same answer. The fixture's okf/finance/margins.md requires
// okf-finance: controller has it, reader doesn't (both meet the channel's requires).

const NAMESPACE = "okf-fixture";
const HIDDEN = "finance/margins.md";
const UNKNOWN = "finance/nope.md";
const READER: Login = { username: "reader", password: "reader" };
const CONTROLLER: Login = { username: "controller", password: "controller" };

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
});

/** The fixture app's surfaces, as each test reads them. */
interface Surfaces {
  app: ReturnType<typeof cds.test>;
  clientFor(login: Login): Promise<McpClient>;
  tool(login: Login, name: string, args: object): Promise<unknown>;
  resource(login: Login, bundlePath: string): Promise<unknown>;
}

function surfacesOf(app: ReturnType<typeof cds.test>): Surfaces {
  const clients = new Map<string, Promise<McpClient>>();
  const clientFor = (login: Login) => {
    let client = clients.get(login.username);
    if (client === undefined) {
      client = connectMcp((app as unknown as { url: string }).url, login);
      clients.set(login.username, client);
    }
    return client;
  };
  afterAll(async () => {
    for (const client of clients.values()) await (await client).close();
  });

  const tool = async (login: Login, name: string, args: object) => {
    const result = await (await clientFor(login)).callTool({ name, arguments: args });
    if (result.isError === true) return { error: result.content?.[0]?.text ?? "" };
    return (result.structuredContent as { value: unknown }).value;
  };
  const resource = async (login: Login, bundlePath: string) => {
    const uri = `okf://${NAMESPACE}/${bundlePath}`;
    try {
      return (await (await clientFor(login)).readResource({ uri })).contents[0]?.text;
    } catch (error) {
      const { code, message } = error as { code: number; message: string };
      return { error: `${code} ${message.replaceAll(uri, "<uri>")}` };
    }
  };

  return { app, clientFor, tool, resource };
}

describeWithGavdi("a role-restricted curated note (requires: okf-finance)", () => {
  const surfaces = surfacesOf(cds.test(path.join(__dirname, "..", "fixtures", "app-gavdi-mcp")));
  toolChecks(surfaces);
  textChecks(surfaces);
  multiPathChecks(surfaces);
  businessKnowledgeChecks(surfaces);
  resourceAndRouteChecks(surfaces);
});

function toolChecks({ tool }: Surfaces): void {
  test("tools: listed, found and readable with the role only", async () => {
    const listed = async (login: Login) =>
      ((await tool(login, "OkfService_searchConcepts", { top: 100 })) as { path: string }[]).map(
        (row) => row.path,
      );
    expect(await listed(CONTROLLER)).toContain(HIDDEN);
    expect(await listed(READER)).not.toContain(HIDDEN);
    const found = (await tool(READER, "OkfService_searchConcepts", {
      text: "margin rules pricing",
    })) as { path: string }[];
    expect(found.map((row) => row.path)).not.toContain(HIDDEN);
    expect(await tool(CONTROLLER, "OkfService_getConcept", { path: HIDDEN })).toContain(
      "The margin is set per genre.",
    );
  });

  test("tools: a hidden path gives the same answer as an unknown one", async () => {
    const hidden = await tool(READER, "OkfService_getConcept", { path: HIDDEN });
    const unknown = await tool(READER, "OkfService_getConcept", { path: UNKNOWN });
    const general = (answer: unknown) =>
      JSON.stringify(answer).replaceAll(/finance\/\w+\.md/g, "<p>");
    expect(general(hidden)).toEqual(general(unknown));
    expect(hidden).toHaveProperty("error");
    expect(await tool(READER, "OkfService_getIndex", { folder: "finance" })).toEqual(
      await tool(READER, "OkfService_getIndex", { folder: "nowhere" }).then((answer) =>
        JSON.parse(JSON.stringify(answer).replaceAll("nowhere", "finance")),
      ),
    );
  });
}

function textChecks({ tool, resource }: Surfaces): void {
  test("getIndex, the index resource and other notes don't mention it", async () => {
    for (const text of [
      await tool(READER, "OkfService_getIndex", {}),
      await resource(READER, "index.md"),
      await tool(READER, "OkfService_getConcept", { path: "guides/shipping.md" }),
      await resource(READER, "guides/shipping.md"),
    ]) {
      expect(text).toEqual(expect.any(String));
      expect(text).not.toMatch(/margins\.md|Margin rules|finance\//);
    }
    expect(await tool(CONTROLLER, "OkfService_getIndex", {})).toContain(
      "[Margin rules](finance/margins.md)",
    );
  });

  test('"Read together with" names it under the title only for the role, on both channels', async () => {
    const line =
      "# Shipping\n<!-- okf:together:start -->\nRead together with: Margin rules (finance/margins.md)\n<!-- okf:together:end -->\n";
    expect(
      await tool(CONTROLLER, "OkfService_getConcept", { path: "guides/shipping.md" }),
    ).toContain(line);
    expect(await resource(CONTROLLER, "guides/shipping.md")).toContain(line);
    expect(
      await tool(READER, "OkfService_getConcept", { path: "guides/shipping.md" }),
    ).not.toContain("okf:together");
  });
}

function multiPathChecks({ tool }: Surfaces): void {
  test("getConcept with several paths: the hidden one reads as unknown, the others still come", async () => {
    const paths = ["guides/shipping.md", HIDDEN, UNKNOWN];
    const text = (await tool(READER, "OkfService_getConcept", { paths })) as string;
    const parts = text.split(/^<!-- okf:concept (.+) -->$/m);
    expect(parts.filter((_, index) => index % 2 === 1)).toEqual(paths);
    expect(parts[2]).toContain("# Shipping");
    // The same text, apart from the path; the last part has no blank line after it.
    expect(parts[4]!.replace(HIDDEN, "<path>").trim()).toBe(
      parts[6]!.replace(UNKNOWN, "<path>").trim(),
    );
    expect(parts[4]).toContain("isn't a file of the bundle");
    const controller = (await tool(CONTROLLER, "OkfService_getConcept", { paths })) as string;
    expect(controller).toContain("The margin is set per genre.");
  });

  test("getConcept with more than five paths is an error", async () => {
    const paths = ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"];
    expect(await tool(READER, "OkfService_getConcept", { paths })).toEqual({
      error: expect.stringContaining("at most 5 are read in one call"),
    });
  });
}

function businessKnowledgeChecks({ tool }: Surfaces): void {
  test("the Business knowledge section of a generated concept names it only for the role", async () => {
    const books = "model/AdminService/Books.md";
    expect(await tool(CONTROLLER, "OkfService_getConcept", { path: books })).toMatch(
      /## Business knowledge[\s\S]*\[Margin rules\]\(\/finance\/margins\.md\)/,
    );
    expect(await tool(READER, "OkfService_getConcept", { path: books })).not.toMatch(
      /Margin rules|finance\/margins/,
    );
  });
}

function resourceAndRouteChecks({ app, clientFor, resource }: Surfaces): void {
  test("resources: not read, not completed; the same answer as an unknown path", async () => {
    expect(await resource(CONTROLLER, HIDDEN)).toContain("The margin is set per genre.");
    const hidden = await resource(READER, HIDDEN);
    expect(hidden).toEqual(await resource(READER, UNKNOWN));
    expect(hidden).toHaveProperty("error");
    const complete = async (login: Login, value: string) =>
      (
        await (
          await clientFor(login)
        ).complete({
          ref: { type: "ref/resource", uri: `okf://${NAMESPACE}/{+path}` },
          argument: { name: "path", value },
        })
      ).completion.values;
    expect(await complete(READER, "")).not.toContain(HIDDEN);
    expect(await complete(READER, "finance/")).toEqual([]);
    expect(await complete(CONTROLLER, "finance/")).toContain(HIDDEN);
  });

  test("static route: 404 without the role, as for an unknown path", async () => {
    const get = (login: Login, file: string) =>
      app.axios.get(`/okf/${file}`, { auth: login, validateStatus: () => true });
    expect((await get(CONTROLLER, HIDDEN)).status).toBe(200);
    expect((await get(READER, HIDDEN)).status).toBe(404);
    expect((await get(READER, "finance/index.md")).status).toBe(404);
    expect((await get(READER, "index.md")).data).not.toMatch(/finance/);
  });

  test("the Index entity, in-process, lists it and links to it only for the role", async () => {
    const rowsFor = async (id: string, roles: string[]) => {
      const user = new cds.User({ id, roles, attr: {} });
      const service = cds.services["OkfService"] as cds.Service;
      return (await service.tx({ user }, (tx) => tx.run(SELECT.from("OkfService.Index")))) as {
        path: string;
        links: string | null;
      }[];
    };
    const reader = await rowsFor("reader", ["okf-reader"]);
    expect(reader.map((row) => row.path)).not.toContain(HIDDEN);
    expect(reader.some((row) => (row.links ?? "").includes(HIDDEN))).toBe(false);
    const controller = await rowsFor("controller", ["okf-reader", "okf-finance"]);
    expect(controller.map((row) => row.path)).toContain(HIDDEN);
  });
}

describeWithGavdi("search on the fixture: any word, body, aliases, never empty", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-gavdi-mcp"));
  let client: Promise<McpClient> | undefined;
  afterAll(async () => client && (await client).close());
  const search = async (text: string) => {
    client ??= connectMcp((app as unknown as { url: string }).url, READER);
    const result = await (
      await client
    ).callTool({ name: "OkfService_searchConcepts", arguments: { text } });
    return (result.structuredContent as { value: { path: string; matched: boolean }[] }).value;
  };

  test.each([
    ["any word of several", "how are orders shipped to customers"],
    ["a word only in the body", "parcel"],
    ["an alias", "dispatch"],
  ])("%s finds the guide", async (_what, text) => {
    const hits = await search(text);
    expect(hits[0]).toEqual(expect.objectContaining({ path: "guides/shipping.md", matched: true }));
  });

  test("no word found: the curated outline, flagged", async () => {
    const hits = await search("xylophone quartz");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => !hit.matched)).toBe(true);
    expect(hits.map((hit) => hit.path)).toContain("guides/shipping.md");
  });
});
