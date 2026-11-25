import path from "node:path";
import cds from "@sap/cds";
import { describeWithCommunity, COMMUNITY_PLUGIN } from "../helpers/community";
import { rpc } from "../helpers/mcp-rpc";
import { BOB, mcpToolsChannel } from "./mcp-tools-channel";
import { hiddenContract, serverContract } from "./server.contract";

// The server contract (4.1) on the MCP tools channel (4.5), through @gavdi/cap-mcp v2 itself
// (the neighbouring checkout's lib/), on the demo app with cds.okf.serve.mcp asking for tools
// and the default requires (authenticated-user).

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: COMMUNITY_PLUGIN } },
  okf: { serve: { mcp: { as: ["tools"] } } },
});

describeWithCommunity("the MCP tools channel through @gavdi/cap-mcp", () => {
  const { GET, POST } = cds.test(path.join(__dirname, "..", "..", "demo"));
  const channel = () => mcpToolsChannel(POST as never);

  serverContract("MCP tools", channel, {
    reader: "authenticated",
    concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
    curated: "guides/ordering.md",
    withAuthSection: ["model/AdminService/Orders.md", "guides/ordering.md"],
  });

  hiddenContract("MCP tools", channel, "guides/ordering.md");

  test("the plugin offers exactly OkfService's three agent-facing tools", async () => {
    const answer = await rpc(POST as never, BOB, "tools/list");
    const names = (answer.message?.result?.["tools"] as { name: string }[]).map(
      (tool) => tool.name,
    );
    expect(names.filter((name) => name.startsWith("OkfService_")).sort()).toEqual([
      "OkfService_getConcept",
      "OkfService_getIndex",
      "OkfService_searchConcepts",
    ]);
  });

  // ADR-0006/0010: under @gavdi/cap-mcp, OkfService is reached through MCP only.
  test("@protocol 'none' holds end to end: no OData endpoint, the tools still answer", async () => {
    expect((await GET("/odata/v4/okf-service/Index", { validateStatus: () => true })).status).toBe(
      404,
    );
    const index = await rpc(POST as never, BOB, "tools/call", {
      name: "OkfService_getIndex",
      arguments: {},
    });
    expect(index.message?.result?.["structuredContent"]).toMatchObject({
      value: expect.stringMatching(/^---\nokf_version: "0.2"\n---\n/),
    });
  });
});
