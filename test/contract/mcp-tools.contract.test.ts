import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { rpc } from "../helpers/mcp-rpc";
import { mcpToolsChannel } from "./mcp-tools-channel";
import { hiddenContract, serverContract } from "./server.contract";

// The server contract (4.1) on the MCP tools channel (4.5), through @gavdi/cap-mcp v2 itself
// (the neighbouring checkout's lib/), on the demo app with cds.okf.serve.mcp asking for tools
// and the default requires (authenticated-user).

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
  okf: { serve: { mcp: { as: ["tools"] } } },
});

describeWithGavdi("the MCP tools channel through @gavdi/cap-mcp", () => {
  const { GET, POST } = cds.test(path.join(__dirname, "..", "..", "demo"));
  const channel = () => mcpToolsChannel(POST as never);

  serverContract("MCP tools", channel, {
    reader: "authenticated",
    concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
    curated: "guides/ordering.md",
    withAuthSection: ["model/AdminService/Orders.md", "guides/ordering.md"],
  });

  hiddenContract("MCP tools", channel, "guides/ordering.md");

  test("the plugin offers exactly OkfService's five tools", async () => {
    const answer = await rpc(POST as never, { username: "bob", password: "bob" }, "tools/list");
    const names = (answer.message?.result?.["tools"] as { name: string }[]).map(
      (tool) => tool.name,
    );
    expect(names.filter((name) => name.startsWith("OkfService_")).sort()).toEqual([
      "OkfService_Index_get",
      "OkfService_Index_query",
      "OkfService_bundleInfo",
      "OkfService_getConcept",
      "OkfService_searchConcepts",
    ]);
  });

  // ADR-0006/0010: under @gavdi/cap-mcp, OkfService is reached through MCP only.
  test("@protocol 'none' holds end to end: no OData endpoint, the tools still answer", async () => {
    expect((await GET("/odata/v4/okf-service/Index", { validateStatus: () => true })).status).toBe(
      404,
    );
    const info = await rpc(POST as never, { username: "bob", password: "bob" }, "tools/call", {
      name: "OkfService_bundleInfo",
      arguments: {},
    });
    expect(info.message?.result?.["structuredContent"]).toMatchObject({
      value: { okfVersion: "0.2", namespace: "cap-okf-demo" },
    });
  });
});
