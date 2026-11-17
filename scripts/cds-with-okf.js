// Runs the cds CLI with this repository's own cap-okf loaded, e.g.
//   npm run cds:okf -- compile test/fixtures/bookshop --to okf -o bundle-preview
// CAP only loads plugins that an app lists as dependencies, never a project's own cds-plugin.js
// (ADR-0005), so CDS_PLUGINS names it here, next to any plugins already named there. It loads
// lib/, so run `npm run build` first; the npm script does. Run it from the repository root (as
// npm run does): cds-dk must use the same @sap/cds as the plugin.
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const plugins = JSON.parse(process.env.CDS_PLUGINS || "{}");
plugins["cap-okf"] = { impl: path.join(root, "cds-plugin.js") };
// cds-dk's script, run with node rather than node_modules/.bin/cds, which is a .cmd on Windows.
const cdsCli = require.resolve("@sap/cds-dk/bin/cds.js");
const result = spawnSync(process.execPath, [cdsCli, ...process.argv.slice(2)], {
  env: { ...process.env, CDS_PLUGINS: JSON.stringify(plugins) },
  stdio: "inherit",
});
if (result.error) {
  console.error(
    `[okf] scripts/cds-with-okf.js — the cds CLI didn't start: ${result.error.message}`,
  );
}
process.exit(result.status ?? 1);
