// Loads @gavdi/cap-mcp v2 from a neighbouring checkout (CAP_MCP_V2, default ../cap-mcp-v2) as a
// CAP plugin, for tests only. Its cds-plugin.js would require its own copy of @sap/cds, and a
// second copy replaces global.cds, so this hands it this repository's cds facade instead; its
// lib/ requires @sap/cds nowhere else. The checkout's lib/ must be built.
const path = require("node:path");

const root = path.resolve(process.env.CAP_MCP_V2 || path.join(__dirname, "..", "..", "cap-mcp-v2"));
require(path.join(root, "lib", "index.js")).plugin(require("@sap/cds"));
