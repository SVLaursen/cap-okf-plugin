import path from "node:path";
import cds from "@sap/cds";
import { describeWithCommunity, COMMUNITY_PLUGIN } from "../helpers/community";
import { connectMcp, type McpClient } from "../helpers/mcp-client";

// ADR-0013: with cds.okf.serve.mcp.instructions and .pointers false, cap-okf registers nothing
// with mcp:hints: no instructions, no tool notes.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: COMMUNITY_PLUGIN } },
  okf: {
    serve: {
      mcp: {
        plugin: "@gavdi/cap-mcp",
        as: ["resources", "tools"],
        namespace: "okf-fixture",
        requires: "okf-reader",
        instructions: false,
        pointers: false,
      },
    },
  },
});

describeWithCommunity("mcp:hints switched off", () => {
  const app = cds.test(path.join(__dirname, "..", "fixtures", "app-community-mcp"));
  let client: Promise<McpClient> | undefined;
  afterAll(async () => client && (await client).close());

  test("no instructions and no tool notes from cap-okf", async () => {
    client = connectMcp((app as unknown as { url: string }).url, {
      username: "controller",
      password: "controller",
    });
    expect((await client).getInstructions() ?? "").not.toContain("OKF notes");
    const { tools } = await (await client).listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect({
        tool: tool.name,
        note: (tool.description ?? "").includes("Business knowledge:"),
      }).toEqual({ tool: tool.name, note: false });
    }
  });
});
