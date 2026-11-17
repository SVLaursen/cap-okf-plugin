import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Task 3.3: `cds add okf`, run as a user runs it: the cds CLI in a child process, loading
// cap-okf through scripts/cds-with-okf.js.

const ROOT = path.join(__dirname, "..", "..");
const FIXTURE = path.join(ROOT, "test", "fixtures", "bookshop");

function cdsAdd(app: string) {
  // Without CDS_CONFIG: test/setup-env.js points it at src/, but a child process can't run TS.
  const env: Record<string, string | undefined> = { ...process.env };
  delete env["CDS_CONFIG"];
  return spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "add", "okf"],
    { cwd: app, env, encoding: "utf8" },
  );
}

/** Every file below `folder` with its text, except node_modules. */
function snapshot(folder: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const file of fs.readdirSync(folder, { recursive: true, encoding: "utf8" })) {
    const full = path.join(folder, file);
    if (fs.statSync(full).isFile())
      files[file.split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
  }
  return files;
}

describe("cds add okf", () => {
  let app: string;

  beforeEach(() => {
    // Inside the repository (gen/ is git-ignored): outside it, cds-dk would load another
    // @sap/cds than the plugin.
    fs.mkdirSync(path.join(ROOT, "gen"), { recursive: true });
    app = fs.mkdtempSync(path.join(ROOT, "gen", "cds-add-"));
    fs.cpSync(FIXTURE, app, { recursive: true });
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "shop", cds: { requires: {} } }, null, 2) + "\n",
    );
  });
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("sets up okf/, the .gitignore entry and the cds.okf defaults", () => {
    const result = cdsAdd(app);
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    const files = snapshot(app);
    expect(files["okf/index.md"]).toContain("okf_version");
    expect(files["okf/guides/getting-started.md"]).toContain("type: Guide");
    expect(files[".gitignore"]).toBe("gen/okf\n");
    expect(JSON.parse(files["package.json"]!).cds.okf).toEqual({
      include: "services",
      serve: { static: false, mcp: false },
    });
  });

  test("running it again changes nothing", () => {
    expect(cdsAdd(app).status).toBe(0);
    const once = snapshot(app);
    expect(cdsAdd(app).status).toBe(0);
    expect(snapshot(app)).toEqual(once);
  });
});
