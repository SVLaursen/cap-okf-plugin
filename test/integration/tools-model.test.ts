import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/gavdi";

// Task 4.5 (ADR-0005 (e)): OkfService's model is added only when the MCP tools channel is on.
// The demo app with "@gavdi/cap-mcp" in its plugin list (an empty stub: only the name counts) and
// cds.okf.serve.mcp asking for tools; CDS_CONFIG is
// read when cds.test starts the app, after this, and Jest gives each file its own process.env.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } },
  okf: { serve: { mcp: { as: ["tools"] } } },
});

const DEMO = path.join(__dirname, "..", "..", "demo");

describe("OkfService with the tools channel on", () => {
  cds.test(DEMO);

  test("is in the app's model, with its entity and functions", () => {
    const names = Object.keys(cds.model!.definitions).filter((name) =>
      name.startsWith("OkfService"),
    );
    expect(names.sort()).toEqual([
      "OkfService",
      "OkfService.Index",
      "OkfService.bundleInfo",
      "OkfService.getConcept",
      "OkfService.searchConcepts",
    ]);
  });

  test("is never part of the bundle it serves (@okf: false)", () => {
    expect(cds.model!.definitions["OkfService"]?.["@okf"]).toBe(false);
  });
});
