// @gavdi/cap-mcp v2 for tests: from a neighbouring checkout, not npm (it isn't released yet).
// Tests that need it skip, with a note, where the checkout isn't there (e.g. in CI).
import fs from "node:fs";
import path from "node:path";

// The same rule as test/gavdi-cap-mcp-plugin.js: an empty CAP_MCP_V2 counts as not set.
export const GAVDI_ROOT = path.resolve(
  process.env["CAP_MCP_V2"] || path.join(__dirname, "..", "..", "..", "cap-mcp-v2"),
);

/** An empty plugin to register under "@gavdi/cap-mcp" where only its name must be found. */
export const MCP_PLUGIN_STUB = path.join(__dirname, "..", "mcp-plugin-stub.js");

/** The test-only plugin entry that loads it with this repository's @sap/cds. */
export const GAVDI_PLUGIN = path.join(__dirname, "..", "gavdi-cap-mcp-plugin.js");

export const hasGavdi = fs.existsSync(path.join(GAVDI_ROOT, "lib", "index.js"));

/** describe, or describe.skip with the reason in its name when the checkout is missing. */
export function describeWithGavdi(name: string, body: () => void): void {
  if (hasGavdi) describe(name, body);
  else describe.skip(`${name} (skipped: no @gavdi/cap-mcp v2 build at ${GAVDI_ROOT})`, body);
}
