import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";
import { MCP_PLUGIN_STUB } from "../helpers/gavdi";
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

function cdsBuild(app: string, extraEnv: Record<string, string> = {}, args: string[] = []) {
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
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "build", app, ...args],
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
    expect({ status: result.status, okf: result.stderr.includes("[okf]") }).toEqual({
      status: 0,
      okf: false,
    });
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

  test("writes the bundle to <root>/gen/okf, curated files merged in, without the stale file", async () => {
    expect(result.status).toBe(0);
    const written = readTree(path.join(app, "gen", "okf"));
    const underModel = (files: { path: string }[]) =>
      files.filter((file) => file.path.startsWith("model/"));
    expect(underModel(written)).toEqual(underModel(await expectedBundle()));
    expect(written.find((file) => file.path === "ordering.md")?.text).toBe(curated);
    expect(written.map((file) => file.path)).not.toContain("stale.md");
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

// Review findings: the bundle must describe the model the deployed app has, land only in
// <target>/okf, and never keep stale files in the deployed copy.
describe("cds build, where the bundle comes from and goes to", () => {
  let app: string;
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("a loose .cds file at the project root, which the app doesn't load, isn't documented", () => {
    app = bookshopApp();
    fs.rmSync(path.join(app, "index.cds"));
    fs.writeFileSync(path.join(app, "scratch.cds"), "service ScratchService { action ping(); }");
    expect(cdsBuild(app).status).toBe(0);
    expect(fs.existsSync(path.join(app, "gen", "okf", "model", "CatalogService.md"))).toBe(true);
    expect(fs.existsSync(path.join(app, "gen", "okf", "model", "ScratchService.md"))).toBe(false);
  });

  test.each([{ src: "okf" }, { dest: "okf" }])(
    "an okf task with %j still writes <root>/gen/okf and leaves okf/ untouched",
    (task) => {
      app = bookshopApp({
        build: { target: ".", tasks: [{ for: "nodejs" }, { for: "okf", ...task }] },
      });
      fs.mkdirSync(path.join(app, "okf"));
      fs.writeFileSync(path.join(app, "okf", "ordering.md"), "---\ntype: Guide\n---\n");
      expect(cdsBuild(app).status).toBe(0);
      expect(fs.existsSync(path.join(app, "gen", "okf", "index.md"))).toBe(true);
      expect(fs.readdirSync(path.join(app, "okf"))).toEqual(["ordering.md"]);
    },
  );

  test("with --dest, the review copy stays in gen/okf, outside the deployed app", () => {
    app = bookshopApp();
    expect(cdsBuild(app, {}, ["--dest", "out"]).status).toBe(0);
    expect(fs.existsSync(path.join(app, "gen", "okf", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(app, "gen", "out", "okf-bundle", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(app, "gen", "out", "okf"))).toBe(false);
  });

  test("a deployed app outside gen/ gets no stale files in its okf-bundle", () => {
    app = bookshopApp({ build: { tasks: [{ for: "nodejs", dest: "../deploy" }, { for: "okf" }] } });
    const stale = path.join(app, "deploy", "okf-bundle", "model", "Old.md");
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, "---\ntype: Old\n---\n");
    expect(cdsBuild(app).status).toBe(0);
    expect(fs.existsSync(path.join(app, "deploy", "okf-bundle", "index.md"))).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
  });
});

// Task 3.1: the curated okf/ folder merged with the generated model/ (ADR-0007).
const ordering =
  "---\ntype: Guide\ntitle: Placing an order\ndescription: How a shopper orders.\n---\n\n" +
  "Shoppers browse [Books](/model/CatalogService/Books.md) first.\n";

describe("cds build with a curated okf/ folder", () => {
  let app: string;
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("merges curated files into gen/okf and the deployed copy, with a root index listing both", () => {
    app = bookshopApp();
    fs.mkdirSync(path.join(app, "okf", "guides"), { recursive: true });
    fs.writeFileSync(path.join(app, "okf", "guides", "ordering.md"), ordering);
    fs.writeFileSync(path.join(app, "okf", "guides", "query.sql"), "select 1;\n");
    const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x01]);
    fs.writeFileSync(path.join(app, "okf", "guides", "logo.png"), logo);
    const result = cdsBuild(app);
    expect({ status: result.status, okf: result.stdout.includes("[okf]") }).toEqual({
      status: 0,
      okf: false,
    });
    const written = readTree(path.join(app, "gen", "okf"));
    expect(written.find((file) => file.path === "guides/ordering.md")?.text).toBe(ordering);
    expect(written.find((file) => file.path === "guides/query.sql")?.text).toBe("select 1;\n");
    const root = written.find((file) => file.path === "index.md")!.text;
    expect(root).toContain("* [guides](guides/index.md)");
    expect(root).toContain("* [model](model/index.md)");
    expect(readTree(path.join(app, "gen", "srv", "okf-bundle"))).toEqual(written);
    for (const folder of [
      ["gen", "okf"],
      ["gen", "srv", "okf-bundle"],
    ]) {
      expect(fs.readFileSync(path.join(app, ...folder, "guides", "logo.png"))).toEqual(logo);
    }
  });
});

describe("cds build with a curated okf/ folder: curated mistakes", () => {
  let app: string;
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("a curated file under okf/model/ fails the build, named by its okf/ path", () => {
    app = bookshopApp();
    fs.mkdirSync(path.join(app, "okf", "model"), { recursive: true });
    fs.writeFileSync(path.join(app, "okf", "model", "notes.md"), ordering);
    const result = cdsBuild(app);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      "[okf] okf/model/notes.md:1 — model/ belongs to the generator",
    );
    expect(fs.existsSync(path.join(app, "gen", "srv", "okf-bundle"))).toBe(false);
  });

  test("a curated file without frontmatter fails the build, named by its okf/ path", () => {
    app = bookshopApp();
    fs.mkdirSync(path.join(app, "okf"));
    fs.writeFileSync(path.join(app, "okf", "broken.md"), "no frontmatter\n");
    const result = cdsBuild(app);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("[okf] okf/broken.md:1 — ");
  });
});

// Task 3.2: a model clash fails the build with the .cds file and line, plainly.
describe("cds build with definitions whose paths clash", () => {
  // Built from the repository root, not the app: CAP records $location relative to cds.root.
  // The app's real path, so no link (on macOS, /var → /private/var) can hide a wrong base.
  test("fails with the [okf] message naming the .cds file and line, and no stack trace", () => {
    const app = fs.realpathSync(bookshopApp());
    try {
      fs.writeFileSync(
        path.join(app, "db", "clash.cds"),
        "namespace clash;\nentity Books { key ID : Integer; }\nentity books { key ID : Integer; }\n",
      );
      const result = cdsBuild(app, { CDS_OKF_INCLUDE: "all" });
      const output = result.stdout + result.stderr;
      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "[okf] db/clash.cds:3 — clash.books: its path model/clash/books.md differs from " +
          "model/clash/Books.md (clash.Books, db/clash.cds:2) only in letter case or Unicode form (M1).",
      );
      expect(output).not.toMatch(/\n\s+at /);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});

// Task 4.5 (ADR-0005 (e)): with the MCP tools channel on, cds build puts OkfService into the
// deployed app's model, for no task list and for one with okf; a list without okf misses it.
// "@gavdi/cap-mcp" is an empty stub here: detection only needs its name in the plugin list.
describe("cds build with the MCP tools channel on", () => {
  const withGavdi = {
    CDS_PLUGINS: JSON.stringify({ "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } }),
  };

  function deployedModel(app: string): string {
    return fs.readFileSync(path.join(app, "gen", "srv", "srv", "csn.json"), "utf8");
  }

  test.each([
    ["no task list", true, undefined],
    ["[nodejs, okf]", true, [{ for: "nodejs" }, { for: "okf" }]],
    ["[nodejs]", false, [{ for: "nodejs" }]],
  ])("%s: OkfService in gen/srv is %s", (_label, expected, tasks) => {
    const okf = { serve: { mcp: { as: ["tools"] } } };
    const app = bookshopApp(tasks === undefined ? { okf } : { okf, build: { tasks } });
    try {
      const result = cdsBuild(app, withGavdi);
      expect({ status: result.status, stderr: result.stderr.includes("[okf]") }).toEqual({
        status: 0,
        stderr: false,
      });
      expect(deployedModel(app).includes('"OkfService"')).toBe(expected);
      // @okf: false: the service that serves the bundle is never a concept in it.
      expect(fs.existsSync(path.join(app, "gen", "okf", "model", "OkfService.md"))).toBe(false);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });

  test("with MCP off, OkfService is absent", () => {
    const app = bookshopApp();
    try {
      expect(cdsBuild(app, withGavdi).status).toBe(0);
      expect(deployedModel(app).includes('"OkfService"')).toBe(false);
    } finally {
      fs.rmSync(app, { recursive: true, force: true });
    }
  });
});
