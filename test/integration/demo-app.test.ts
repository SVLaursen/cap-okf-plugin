import { execFileSync } from "node:child_process";
import path from "node:path";
import cds from "@sap/cds";

// The demo app is where cap-okf runs as a real CAP plugin.

const ROOT = path.join(__dirname, "..", "..");
const DEMO = path.join(ROOT, "demo");
const ALICE = { auth: { username: "alice", password: "alice" } };

/** CAP's plugin list as `cds env plugins --json` prints it, run in the demo like a user would. */
function demoPlugins(): Record<string, { impl: string }> {
  // Without CDS_CONFIG: test/setup-env.js points it at src/, which would hide the real wiring.
  const env = { ...process.env };
  delete env["CDS_CONFIG"];
  // Run cds-dk's script with node rather than node_modules/.bin/cds, which is a .cmd on Windows.
  const cdsCli = require.resolve("@sap/cds-dk/bin/cds.js");
  const args = [cdsCli, "env", "plugins", "--json"];
  const output = execFileSync(process.execPath, args, { cwd: DEMO, env, encoding: "utf8" });
  return JSON.parse(output) as Record<string, { impl: string }>;
}

const { GET } = cds.test(DEMO);

describe("demo app: cap-okf wiring", () => {
  // CAP only loads plugins an app lists as dependencies, never a project's own cds-plugin.js,
  // so this proves the workspace wiring ("cap-okf": "file:..") works outside the tests.
  test("CAP finds cap-okf through the demo's dependency, at the repo's cds-plugin.js", () => {
    expect(demoPlugins()["cap-okf"]?.impl).toBe(path.join(ROOT, "cds-plugin.js"));
  });

  // Tests run without NODE_ENV=production, so the [development] profile is active.
  test("serves the static route in development only, and no MCP (ADR-0002, ADR-0004)", () => {
    expect(cds.env["okf"]?.serve).toEqual({ static: true, mcp: false });
  });

  // Tests must exercise the TypeScript sources, not a possibly stale lib/ (test/setup-env.js).
  // ADR-0005 (e): MCP is off in the demo, so OkfService isn't added.
  test("without the MCP tools channel, the app has no OkfService", () => {
    expect(cds.model?.definitions["OkfService"]).toBeUndefined();
  });

  test("in these tests, CAP loads cap-okf from src/", () => {
    const impl = (cds.env["plugins"] as Record<string, { impl: string }>)["cap-okf"]?.impl;
    expect(impl).toBe(path.join(ROOT, "test", "cds-plugin-src.js"));
  });
});

// These keep the demo bootable; they test the demo app, not cap-okf.
describe("demo app: smoke tests", () => {
  test("serves CatalogService to anonymous users", async () => {
    const { status } = await GET("/odata/v4/catalog/Books");
    expect(status).toBe(200);
  });

  test("rejects anonymous users on AdminService", async () => {
    await expect(GET("/odata/v4/admin/Books")).rejects.toMatchObject({ status: 401 });
  });

  test("lets alice (admin) read AdminService", async () => {
    const { status } = await GET("/odata/v4/admin/Books", ALICE);
    expect(status).toBe(200);
  });
});
