import path from "node:path";
import cds from "@sap/cds";
import { describeWithGavdi, GAVDI_PLUGIN } from "../helpers/gavdi";
import { rpc } from "../helpers/mcp-rpc";
import { BOB, mcpToolsChannel } from "./mcp-tools-channel";
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
  // The plugin itself is there and answering, so "serves nothing" is about cap-okf, not /mcp.
  test("/mcp answers, without any OkfService tool", async () => {
    const answer = await rpc(POST as never, BOB, "tools/list");
    expect(answer.status).toBe(200);
    const tools = (answer.message?.result?.["tools"] ?? []) as { name: string }[];
    expect(tools.filter((tool) => tool.name.startsWith("OkfService_"))).toEqual([]);
  });

  disabledContract(
    "MCP tools",
    () => mcpToolsChannel(POST as never),
    "model/CatalogService/Books.md",
  );
});
