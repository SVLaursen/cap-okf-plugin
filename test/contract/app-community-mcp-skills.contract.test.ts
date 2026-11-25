import path from "node:path";
import cds from "@sap/cds";
import { describeWithCommunity, COMMUNITY_PLUGIN } from "../helpers/community";
import { connectMcp, type Login, type McpClient } from "../helpers/mcp-client";

// Task dr.2: the fixture app test/fixtures/app-community-mcp-skills is app-community-mcp (same model and
// users) plus two Agent Skills that @gavdi/cap-mcp 2.0 serves from cds.mcp.skills (their ADR
// 0016): ship-order, with a file under references/, which two curated notes name (one of them
// only for okf-finance), and tidy-catalog, which no note names. A third note names a skill that
// isn't served. This suite only proves the fixture works: both plugins serve side by side.

const READER: Login = { username: "reader", password: "reader" };
const CONTROLLER: Login = { username: "controller", password: "controller" };
const OUTSIDER: Login = { username: "outsider", password: "outsider" };

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: COMMUNITY_PLUGIN } },
});

describeWithCommunity("the skills fixture app, through a real MCP client", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-community-mcp-skills"));
  const clients: Promise<McpClient>[] = [];
  const connect = (login: Login) => {
    const client = connectMcp((app as unknown as { url: string }).url, login);
    clients.push(client);
    return client;
  };
  afterAll(async () => {
    for (const client of clients) await (await client).close();
  });

  test("serves both skills and the OKF index side by side", async () => {
    const { resources } = await (await connect(READER)).listResources();
    const uris = resources.map((each) => each.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        "skill://ship-order/SKILL.md",
        "skill://tidy-catalog/SKILL.md",
        "okf://okf-fixture/index.md",
      ]),
    );
  });

  test("a skill's file under references/ reads as a skill:// resource", async () => {
    const uri = "skill://ship-order/references/checklist.md";
    const { contents } = await (await connect(READER)).readResource({ uri });
    expect(contents[0]?.text).toContain("# Shipping checklist");
  });

  test("the notes that name skills are served as OKF concepts", async () => {
    const client = await connect(READER);
    const read = async (notePath: string) =>
      (await client.readResource({ uri: `okf://okf-fixture/${notePath}` })).contents[0]?.text;
    expect(await read("guides/shipping.md")).toContain("skills: [ship-order]");
    expect(await read("guides/returns.md")).toContain("skills: [handle-return]");
  });

  test("the finance note that names a skill is only for okf-finance", async () => {
    const uri = "okf://okf-fixture/finance/margins.md";
    const controller = await connect(CONTROLLER);
    expect((await controller.readResource({ uri })).contents[0]?.text).toContain(
      "skills: ship-order",
    );
    await expect((await connect(READER)).readResource({ uri })).rejects.toThrow();
  });

  test("a caller without requires gets nothing from cap-okf, but still the skills", async () => {
    const { resources } = await (await connect(OUTSIDER)).listResources();
    const uris = resources.map((each) => each.uri);
    expect(uris.some((uri) => uri.startsWith("okf://"))).toBe(false);
    expect(uris).toContain("skill://ship-order/SKILL.md");
    expect((await connect(OUTSIDER)).getInstructions() ?? "").toBe("");
  });
});
