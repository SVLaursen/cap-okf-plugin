import path from "node:path";
import cds from "@sap/cds";
import { describeWithCommunity, COMMUNITY_PLUGIN } from "../helpers/community";
import { connectMcp, type Login, type McpClient } from "../helpers/mcp-client";
import { directiveFor } from "../../src/serve/mcp/tool-texts";

// ADR-0013 (Contract C, client side) end to end, with the defaults: @gavdi/cap-mcp's mcp:hints
// carries cap-okf's server instructions and the directive parts of OkfService's tool
// descriptions to a real MCP client; tool notes on the app's own tools are off. In the fixture,
// finance/margins.md is pinned and requires okf-finance (controller has it, reader doesn't,
// outsider doesn't meet `requires`).

const READER: Login = { username: "reader", password: "reader" };
const CONTROLLER: Login = { username: "controller", password: "controller" };
const OUTSIDER: Login = { username: "outsider", password: "outsider" };

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: COMMUNITY_PLUGIN } },
});

describeWithCommunity("mcp:hints with the defaults, through a real MCP client", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-community-mcp"));
  const clients: Promise<McpClient>[] = [];
  const connect = (login: Login) => {
    const client = connectMcp((app as unknown as { url: string }).url, login);
    clients.push(client);
    return client;
  };
  afterAll(async () => {
    for (const client of clients) await (await client).close();
  });
  const descriptionOf = async (login: Login, tool: string) => {
    const { tools } = await (await connect(login)).listTools();
    return tools.find((each) => each.name === tool)?.description ?? "";
  };

  test("the instructions tie reading to need, say the notes have gaps, and how to read", async () => {
    const instructions = (await connect(READER)).getInstructions() ?? "";
    expect(instructions).toContain("When a request uses a business term, code or status value");
    expect(instructions).toContain("A plain read of one record by key or name doesn't need it.");
    expect(instructions).toContain("say it isn't defined instead of assuming one");
    expect(instructions).toContain("OkfService_getIndex or okf://okf-fixture/index.md");
  });

  test("the pinned note is listed in the instructions only for the role that sees it", async () => {
    expect((await connect(READER)).getInstructions() ?? "").not.toContain("Pinned notes");
    expect((await connect(CONTROLLER)).getInstructions() ?? "").toContain(
      "Pinned notes, which always apply:\n- Margin rules (finance/margins.md): How the shop sets the margin on a book's price.",
    );
  });

  test("tool notes are off: the app's tools keep their own descriptions", async () => {
    expect(await descriptionOf(CONTROLLER, "CatalogService_Books_query")).not.toContain(
      "Business knowledge:",
    );
  });

  test("OkfService's tools: the neutral description, then the directive part", async () => {
    for (const name of ["getIndex", "getConcept", "searchConcepts"]) {
      const description = await descriptionOf(READER, `OkfService_${name}`);
      expect(description).toMatch(/^(Returns|Finds) /);
      expect(description.endsWith(`\n\n${directiveFor(`OkfService.${name}`)}`)).toBe(true);
    }
  });

  test("a caller without requires gets no instructions", async () => {
    expect((await connect(OUTSIDER)).getInstructions() ?? "").toBe("");
  });
});
