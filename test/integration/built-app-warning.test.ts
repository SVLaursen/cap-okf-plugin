import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/community";

// Task 4.5 (ADR-0005 (e)): an app that lists its own build tasks without okf gets no
// OkfService in its build. When that built app is served with the tools channel on, cap-okf
// warns once at served. The app is built inside the repository (gen/ is git-ignored), so the
// built app resolves the same modules as the tests.

const ROOT = path.join(__dirname, "..", "..");
fs.mkdirSync(path.join(ROOT, "gen"), { recursive: true });
const app = fs.mkdtempSync(path.join(ROOT, "gen", "built-app-"));
fs.cpSync(path.join(ROOT, "test", "fixtures", "bookshop"), app, { recursive: true });
const okf = { serve: { mcp: { as: ["tools"] } } };
const packageJson = {
  name: "bookshop-built",
  version: "1.0.0",
  cds: { okf, build: { tasks: [{ for: "nodejs" }] } },
};
fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(packageJson, null, 2));

// Built synchronously before cds.test, which starts the built app in its own beforeAll.
const env: Record<string, string | undefined> = {
  ...process.env,
  CDS_PLUGINS: JSON.stringify({ "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } }),
};
delete env["CDS_CONFIG"];
const build = spawnSync(
  process.execPath,
  [path.join(ROOT, "scripts", "cds-with-okf.js"), "build", app],
  {
    cwd: ROOT,
    env,
    encoding: "utf8",
  },
);

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } },
  requires: { db: { kind: "sqlite", credentials: { url: ":memory:" } } },
});

const warnings: string[] = [];
const warn = jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
  warnings.push(args.map(String).join(" "));
});

cds.test(path.join(app, "gen", "srv"));

afterAll(() => {
  warn.mockRestore();
  fs.rmSync(app, { recursive: true, force: true });
});

test("the build without okf in its task list succeeds and has no OkfService", () => {
  expect(build.status).toBe(0);
  const model = fs.readFileSync(path.join(app, "gen", "srv", "srv", "csn.json"), "utf8");
  expect(model.includes('"OkfService"')).toBe(false);
});

test("serving that build with the tools channel on warns once that OkfService is missing", () => {
  const okfWarnings = warnings.filter((line) => line.includes("[okf] OkfService —"));
  expect(okfWarnings).toHaveLength(1);
  expect(okfWarnings[0]).toMatch(/add \{ "for": "okf" \} to them and build again/);
});
