import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Task 4.11 end to end: cds build stops on a curated file whose authorization end marker has no
// start (L3), naming okf/<path> and the line, and writes no bundle with that file half cut.

const ROOT = path.join(__dirname, "..", "..");
let app: string;

beforeAll(() => {
  fs.mkdirSync(path.join(ROOT, "gen"), { recursive: true });
  app = fs.mkdtempSync(path.join(ROOT, "gen", "markers-app-"));
  fs.cpSync(path.join(ROOT, "test", "fixtures", "bookshop"), app, { recursive: true });
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "bookshop-markers", version: "1.0.0" }, null, 2),
  );
  fs.mkdirSync(path.join(app, "okf", "guides"), { recursive: true });
  fs.writeFileSync(
    path.join(app, "okf", "guides", "broken.md"),
    "---\ntype: Guide\ntitle: Broken\n---\n# Broken\n<!-- okf:auth:end -->\nMore.\n",
  );
});

afterAll(() => fs.rmSync(app, { recursive: true, force: true }));

test("cds build fails with an L3 error naming the curated file and line", () => {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env["CDS_CONFIG"];
  const build = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "build", app],
    { cwd: ROOT, env, encoding: "utf8" },
  );
  expect(build.status).not.toBe(0);
  expect(build.stdout + build.stderr).toContain(
    "[okf] okf/guides/broken.md:6 — an end marker without a start marker",
  );
  expect(fs.existsSync(path.join(app, "gen", "okf", "guides", "broken.md"))).toBe(false);
});
