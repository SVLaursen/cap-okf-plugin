import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { mcpToolsChannel } from "./mcp-tools-channel";
import { serverContract } from "./server.contract";

// The server contract (4.1) on the MCP tools channel with `requires: "any"`, so anonymous
// callers reach the tools through @gavdi/cap-mcp. Only here can "an unauthenticated reader never
// gets an authorization section" fail end to end (ADR-0003): with the default requires,
// anonymous callers never reach a tool at all.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
  okf: { serve: { mcp: { as: ["tools"], requires: "any" } } },
});

describeWithGavdi("the MCP tools channel open to anonymous callers", () => {
  const { POST } = cds.test(path.join(__dirname, "..", "..", "demo"));

  serverContract("MCP tools, requires any", () => mcpToolsChannel(POST as never), {
    reader: "anonymous",
    concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
    curated: "guides/ordering.md",
    withAuthSection: ["model/AdminService/Orders.md", "guides/ordering.md"],
  });
});
