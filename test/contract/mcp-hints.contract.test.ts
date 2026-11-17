import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { connectMcp, type Login, type McpClient } from "../helpers/mcp-client";

// ADR-0013 (Contract C, client side) end to end: @gavdi/cap-mcp's mcp:hints carries cap-okf's
// server instructions and tool notes to a real MCP client. In the fixture, CatalogService is
// @mcp; guides/shipping.md links to CatalogService.Books, and so does finance/margins.md, which
// requires okf-finance (controller has it, reader doesn't, outsider doesn't meet `requires`).

const READER: Login = { username: "reader", password: "reader" };
const CONTROLLER: Login = { username: "controller", password: "controller" };
const OUTSIDER: Login = { username: "outsider", password: "outsider" };

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
});

describeWithGavdi("mcp:hints: instructions and tool notes, through a real MCP client", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-gavdi-mcp"));
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

  test("the server instructions say the knowledge exists and how to read it", async () => {
    const instructions = (await connect(READER)).getInstructions() ?? "";
    expect(instructions).toContain("This app publishes its business knowledge as OKF notes");
    expect(instructions).toContain("OkfService_getIndex");
    expect(instructions).toContain("okf://okf-fixture/index.md");
  });

  test("a tool whose definition a curated note links to points at that note", async () => {
    const reader = await descriptionOf(READER, "CatalogService_Books_query");
    expect(reader).toContain(
      "Business knowledge: Shipping books (guides/shipping.md): How the shop ships an order once it is submitted.",
    );
    expect(reader).not.toMatch(/Margin rules|finance\//);
    expect(await descriptionOf(CONTROLLER, "CatalogService_Books_query")).toContain(
      "Business knowledge: Margin rules (finance/margins.md): How the shop sets the margin on a book's price.; Shipping books (guides/shipping.md)",
    );
  });

  test("OkfService's own tools get no note; a caller without requires gets none at all", async () => {
    expect(await descriptionOf(CONTROLLER, "OkfService_getConcept")).not.toContain(
      "Business knowledge:",
    );
    expect(await descriptionOf(OUTSIDER, "CatalogService_Books_query")).not.toContain(
      "Business knowledge:",
    );
    expect((await connect(OUTSIDER)).getInstructions() ?? "").not.toContain("OKF notes");
  });
});
