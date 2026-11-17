import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Task 4.10 end to end: cds build warns about an unknown cds.okf key and about a serve setting
// the deployed app would stop on, and still builds the bundle. The app is built inside the
// repository (gen/ is git-ignored), so it resolves the same modules as the tests.

const ROOT = path.join(__dirname, "..", "..");
let app: string;

beforeAll(() => {
  fs.mkdirSync(path.join(ROOT, "gen"), { recursive: true });
  app = fs.mkdtempSync(path.join(ROOT, "gen", "config-app-"));
  fs.cpSync(path.join(ROOT, "test", "fixtures", "bookshop"), app, { recursive: true });
  const okf = { inculde: "all", serve: { static: "okf" } };
  const packageJson = { name: "bookshop-config", version: "1.0.0", cds: { okf } };
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(packageJson, null, 2));
});

afterAll(() => fs.rmSync(app, { recursive: true, force: true }));

test("cds build warns about the unknown key and the bad route, and builds the bundle", () => {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env["CDS_CONFIG"];
  const build = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "build", app],
    { cwd: ROOT, env, encoding: "utf8" },
  );
  const output = build.stdout + build.stderr;
  expect(build.status).toBe(0);
  const count = (text: string) => output.split(text).length - 1;
  expect(count("[okf] cds.okf.inculde — isn't a setting of cap-okf")).toBe(1);
  expect(count('[okf] cds.okf.serve.static — "okf" must start with /')).toBe(1);
  expect(fs.existsSync(path.join(app, "gen", "okf", "index.md"))).toBe(true);
});
