// @gavdi/cap-mcp v2 for tests: from a neighbouring checkout, not npm (it isn't released yet).
// Tests that need it skip, with a note, where the checkout isn't there (e.g. in CI).
import fs from "node:fs";
import path from "node:path";

// The same rule as test/community-cap-mcp-plugin.js: an empty CAP_MCP_V2 counts as not set.
export const COMMUNITY_ROOT = path.resolve(
  process.env["CAP_MCP_V2"] || path.join(__dirname, "..", "..", "..", "cap-mcp-v2"),
);

/** An empty plugin to register under "@gavdi/cap-mcp" where only its name must be found. */
export const MCP_PLUGIN_STUB = path.join(__dirname, "..", "mcp-plugin-stub.js");

/** The test-only plugin entry that loads it with this repository's @sap/cds. */
export const COMMUNITY_PLUGIN = path.join(__dirname, "..", "community-cap-mcp-plugin.js");

export const hasCommunity = fs.existsSync(path.join(COMMUNITY_ROOT, "lib", "index.js"));

/**
 * describe, or describe.skip with the reason in its name when the checkout is missing. With
 * REQUIRE_CAP_MCP_V2=1 (CI's integrations job) a missing checkout fails instead of skipping.
 */
export function describeWithCommunity(name: string, body: () => void): void {
  if (!hasCommunity && process.env["REQUIRE_CAP_MCP_V2"] === "1") {
    throw new Error(
      `REQUIRE_CAP_MCP_V2 is set, but there is no @gavdi/cap-mcp v2 build at ${COMMUNITY_ROOT}`,
    );
  }
  if (hasCommunity) describe(name, body);
  else describe.skip(`${name} (skipped: no @gavdi/cap-mcp v2 build at ${COMMUNITY_ROOT})`, body);
}
