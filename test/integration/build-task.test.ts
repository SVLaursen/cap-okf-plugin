import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// `cds build` with the okf build task (task 2.9, ADR-0005 (b), ADR-0007), run as a user runs it:
// the cds CLI in a child process, loading cap-okf through scripts/cds-with-okf.js. Each test
// builds its own copy of the bookshop fixture, made an app by a package.json.

const ROOT = path.join(__dirname, "..", "..");
const FIXTURE = path.join(ROOT, "test", "fixtures", "bookshop");
const EPOCH = "1795001400";
const VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }
).version;

/** A copy of the bookshop fixture with a package.json holding `cds` as its cds config. */
function bookshopApp(cdsConfig: Record<string, unknown> = {}): string {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-build-"));
  fs.cpSync(FIXTURE, app, { recursive: true });
  const packageJson = { name: "bookshop-build-test", version: "1.0.0", cds: cdsConfig };
  fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(packageJson, null, 2));
  return app;
}

function cdsBuild(app: string, extraEnv: Record<string, string> = {}) {
  // Without CDS_CONFIG: test/setup-env.js points it at src/, but a child process can't run TS.
  const env: Record<string, string | undefined> = {
    ...process.env,
    SOURCE_DATE_EPOCH: EPOCH,
    ...extraEnv,
  };
  delete env["CDS_CONFIG"];
  // Run from the repository root, so cds-dk and the plugin share one @sap/cds.
  return spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "build", app],
    { cwd: ROOT, env, encoding: "utf8" },
  );
}

/** The bundle the build should write, made in-process from the same inputs. */
async function expectedBundle(): Promise<{ path: string; text: string }[]> {
  const model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
  return exportModel(model, {
    include: "services",
    now: new Date(Number(EPOCH) * 1000),
    version: VERSION,
    texts: defaultLanguageTexts(cds, model),
  }).map((concept) => ({ path: concept.path, text: serializeConcept(concept) }));
}

function readTree(folder: string): { path: string; text: string }[] {
  return fs
    .readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => fs.statSync(path.join(folder, file)).isFile())
    .map((file) => ({
      path: file.split(path.sep).join("/"),
      text: fs.readFileSync(path.join(folder, file), "utf8"),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

describe("cds build, staging (the default build.target: gen)", () => {
  let app: string;
  let result: ReturnType<typeof cdsBuild>;

  beforeAll(() => {
    app = bookshopApp();
    // A file left from an earlier build must not survive in the bundle.
    fs.mkdirSync(path.join(app, "gen", "okf"), { recursive: true });
    fs.writeFileSync(path.join(app, "gen", "okf", "stale.md"), "---\ntype: Stale\n---\n");
    result = cdsBuild(app);
  });

  afterAll(() => fs.rmSync(app, { recursive: true, force: true }));

  test("succeeds", () => {
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
  });

  test("writes exactly the exporter's bundle to gen/okf, doc comments and texts included", async () => {
    const written = readTree(path.join(app, "gen", "okf"));
    expect(written).toEqual(await expectedBundle());
    const authors = written.find((file) => file.path === "model/sample/bookshop/Authors.md")!;
    expect(authors.text).toContain("description: A person who wrote one or more books.");
  });

  test("puts the same files into the deployed Node.js app, gen/srv/okf-bundle/", () => {
    const deployed = readTree(path.join(app, "gen", "srv", "okf-bundle"));
    expect(deployed.length).toBeGreaterThan(10);
    expect(deployed).toEqual(readTree(path.join(app, "gen", "okf")));
  });
});

describe("cds build, in place (build.target: .)", () => {
  let app: string;
  let result: ReturnType<typeof cdsBuild>;
  const curated = "---\ntype: Guide\ntitle: Ordering\n---\n\n# Ordering\n";

  beforeAll(() => {
    app = bookshopApp({ build: { target: "." } });
    fs.mkdirSync(path.join(app, "okf"));
    fs.writeFileSync(path.join(app, "okf", "ordering.md"), curated);
    fs.mkdirSync(path.join(app, "gen", "okf"), { recursive: true });
    fs.writeFileSync(path.join(app, "gen", "okf", "stale.md"), "---\ntype: Stale\n---\n");
    result = cdsBuild(app);
  });

  afterAll(() => fs.rmSync(app, { recursive: true, force: true }));

  test("writes the bundle to <root>/gen/okf, without the stale file", async () => {
    expect(result.status).toBe(0);
    expect(readTree(path.join(app, "gen", "okf"))).toEqual(await expectedBundle());
  });

  test("leaves the curated okf/ folder untouched", () => {
    expect(readTree(path.join(app, "okf"))).toEqual([{ path: "ordering.md", text: curated }]);
  });

  test("puts no okf-bundle anywhere: in-place builds aren't deployed as built", () => {
    const all = fs.readdirSync(app, { recursive: true, encoding: "utf8" });
    expect(all.filter((file) => file.includes("okf-bundle"))).toEqual([]);
  });
});

// ADR-0005 (b): CAP asks hasTask() only when the app lists no tasks of its own.
describe("cds build with the app's own task list", () => {
  test('builds the bundle when the list has { "for": "okf" }', () => {
    const app = bookshopApp({ build: { tasks: [{ for: "nodejs" }, { for: "okf" }] } });
    try {
      expect(cdsBuild(app).status).toBe(0);
      expect(fs.existsSync(path.join(app, "gen", "okf", "index.md"))).toBe(true);
      expect(fs.existsSync(path.join(app, "gen", "srv", "okf-bundle", "index.md"))).toBe(true);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("builds no bundle when the list leaves okf out", () => {
    const app = bookshopApp({ build: { tasks: [{ for: "nodejs" }] } });
    try {
      expect(cdsBuild(app).status).toBe(0);
      expect(fs.existsSync(path.join(app, "gen", "okf"))).toBe(false);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

describe("cds build, setup mistakes", () => {
  test("a bad cds.okf.include fails the build with the [okf] message, printed plainly", () => {
    const app = bookshopApp({ okf: { include: "everything" } });
    try {
      const result = cdsBuild(app);
      expect(result.status).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain("[okf] cds.okf.include — ");
      expect(output).not.toContain("[[okf]");
      expect(output).not.toMatch(/\n\s+at /);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});
