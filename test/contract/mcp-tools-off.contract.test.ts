import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { mcpToolsChannel } from "./mcp-tools-channel";
import { disabledContract } from "./server.contract";

// The server contract (4.1) on the MCP tools channel turned off: @gavdi/cap-mcp is installed,
// but cds.okf.serve.mcp is false (the demo's setting), so OkfService isn't even in the model.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: GAVDI_PLUGIN } },
});

describeWithGavdi("the MCP tools channel turned off", () => {
  const { POST } = cds.test(path.join(__dirname, "..", "..", "demo"));
  disabledContract(
    "MCP tools",
    () => mcpToolsChannel(POST as never),
    "model/CatalogService/Books.md",
  );
});
