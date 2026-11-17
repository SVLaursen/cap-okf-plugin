import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// `cds compile <model> --to okf` (task 2.8), run as a user runs it: the cds CLI in a child
// process, loading cap-okf through scripts/cds-with-okf.js (ADR-0005: CAP doesn't load a
// project's own cds-plugin.js). Maintainer decisions: without -o it prints the tree of paths;
// the clock is SOURCE_DATE_EPOCH when set.

const ROOT = path.join(__dirname, "..", "..");
const FIXTURE = path.join(ROOT, "test", "fixtures", "bookshop");
const EPOCH = "1795001400";
const VERSION = (
  JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }
).version;

function cdsWithOkf(
  args: string[],
  extraEnv: Record<string, string> = {},
  more: { cwd?: string; input?: string } = {},
) {
  // Without CDS_CONFIG: test/setup-env.js points it at src/, but a child process can't run TS.
  const env: Record<string, string | undefined> = {
    ...process.env,
    SOURCE_DATE_EPOCH: EPOCH,
    ...extraEnv,
  };
  delete env["CDS_CONFIG"];
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", "cds-with-okf.js"), ...args], {
    cwd: more.cwd ?? ROOT,
    env,
    encoding: "utf8",
    input: more.input,
  });
}

/** The bundle the CLI should produce, made in-process from the same inputs. */
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

describe("cds compile --to okf", () => {
  test("without -o, prints the tree of paths, one per line", async () => {
    const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf"]);
    expect(result.status).toBe(0);
    const expected = (await expectedBundle()).map((file) => file.path);
    expect(result.stdout).toBe(expected.join("\n") + "\n");
  });

  test("with -o, writes exactly the bundle the exporter makes, doc comments and texts included", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-compile-"));
    try {
      const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf", "-o", out]);
      expect(result.status).toBe(0);
      const written = readTree(out);
      expect(written).toEqual(await expectedBundle());
      const authors = written.find((file) => file.path === "model/CatalogService/Authors.md")!;
      expect(authors.text).toContain("description: A person who wrote one or more books.");
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  // The second compile runs from the fixture's own folder: the working directory doesn't matter.
  test("two compiles with the same SOURCE_DATE_EPOCH write byte-identical bundles", () => {
    const outs = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-compile-")));
    try {
      const first = cdsWithOkf(["compile", FIXTURE, "--to", "okf", "-o", outs[0]!]);
      const second = cdsWithOkf(
        ["compile", ".", "--to", "okf", "-o", outs[1]!],
        {},
        { cwd: FIXTURE },
      );
      expect([first.status, second.status]).toEqual([0, 0]);
      expect(readTree(outs[0]!).length).toBeGreaterThan(10);
      expect(readTree(outs[0]!)).toEqual(readTree(outs[1]!));
    } finally {
      for (const out of outs) fs.rmSync(out, { recursive: true, force: true });
    }
  });

  // A setup mistake gets the [okf] message and its fix, not a stack trace.
  test("a bad SOURCE_DATE_EPOCH fails with an [okf] message and no stack trace", () => {
    const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf"], { SOURCE_DATE_EPOCH: "soon" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[okf] SOURCE_DATE_EPOCH — ");
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  test("cds.okf.include can be set the ways CAP allows, e.g. CDS_OKF_INCLUDE", () => {
    const services = cdsWithOkf(["compile", FIXTURE, "--to", "okf"]).stdout.split("\n").length;
    const all = cdsWithOkf(["compile", FIXTURE, "--to", "okf"], { CDS_OKF_INCLUDE: "all" });
    expect(all.stdout.split("\n").length).toBeGreaterThan(services);
  });
});

describe("cds compile --to okf refuses options that would mislead", () => {
  test.each([
    ["-l, since texts come from the default language", ["-l", "de"], /\[okf\] -l — /],
    [
      "-s with one service, since the bundle holds every exported one",
      ["-s", "CatalogService"],
      /\[okf\] -s — /,
    ],
    ["--sort, which drops what the model needs to be loaded again", ["--sort"], /\[okf\] model — /],
  ])("%s", (_label, extra, message) => {
    const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf", ...extra]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(message);
    expect(result.stdout).not.toContain("{}");
  });
});

/** The registered "okf" compile target, as CAP's compile command calls it. */
type Target = (csn: unknown, options?: Record<string, unknown>) => Promise<unknown>;
const target = () => (cds.compile.to as unknown as Record<string, Target>)["okf"]!;

describe("the compile target in-process", () => {
  let model: Csn;

  beforeAll(async () => {
    // CAP's types don't declare cds.plugins, the promise that loads every plugin.
    await (cds as unknown as { plugins: Promise<unknown> }).plugins;
    model = (await cds.load(FIXTURE)) as unknown as Csn;
  });

  // Each test changes cds.okf; the configured value comes back afterwards.
  let configured: unknown;
  beforeEach(() => {
    configured = (cds.env as unknown as Record<string, unknown>)["okf"];
  });
  afterEach(() => {
    (cds.env as unknown as Record<string, unknown>)["okf"] = configured;
  });

  test("is registered by the plugin", () => {
    expect(typeof target()).toBe("function");
  });

  test("with an output folder, gives CAP's writer one file per path, without the .md", async () => {
    const files = [
      ...((await target()(model, { dest: "out" })) as Iterable<
        [string, { file: string; suffix: string }]
      >),
    ];
    const tree = ((await target()(model)) as string).split("\n");
    expect(files.map(([, place]) => `${place.file}${place.suffix}`)).toEqual(tree);
    expect(files[0]![0]).toMatch(/^---\nokf_version: "0\.2"\n---\n/);
  });
});

describe("the compile target in-process, refused input", () => {
  let model: Csn;

  beforeAll(async () => {
    model = (await cds.load(FIXTURE)) as unknown as Csn;
  });

  // cds-dk reads a model from stdin only when started as the cds binary itself; such a model's
  // only source is "<stdin>.cds", as with any model compiled from a string.
  test("a model piped in on stdin is refused: there is no file to load again", async () => {
    const piped = cds.compile("entity A { key ID : Integer; }");
    await expect(target()(piped)).rejects.toThrow(
      /\[okf\] model — wasn't compiled from CDS files on disk/,
    );
  });

  test("-s with one service is refused at once; -s all, which -o sets, is fine", async () => {
    expect(() => target()(model, { service: "CatalogService" })).toThrow(/\[okf\] -s — /);
    await expect(target()(model, { service: "all" })).resolves.toEqual(expect.any(String));
  });

  test("-l is refused at once, before any promise exists", () => {
    expect(() => target()(model, { lang: "de" })).toThrow(/\[okf\] -l — /);
  });

  test("cds.okf.include chooses what is exported", async () => {
    const services = (await target()(model)) as string;
    (cds.env as unknown as Record<string, unknown>)["okf"] = { include: "all" };
    const all = (await target()(model)) as string;
    expect(all.split("\n").length).toBeGreaterThan(services.split("\n").length);
  });

  test("an unknown cds.okf.include fails with an [okf] message naming the allowed values", async () => {
    (cds.env as unknown as Record<string, unknown>)["okf"] = { include: "everything" };
    await expect(target()(model)).rejects.toThrow(
      /\[okf\] cds\.okf\.include — [\s\S]*"services"[\s\S]*"all"/,
    );
  });

  test("a model without $sources is refused, since it can't be reloaded with doc comments", async () => {
    await expect(target()(JSON.parse(JSON.stringify(model)))).rejects.toThrow(
      /\[okf\] model — wasn't compiled from CDS files on disk/,
    );
  });
});

test("scripts/cds-with-okf.js runs the cds CLI with cap-okf loaded, keeping plugins already set", () => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    CDS_PLUGINS: JSON.stringify({ other: { impl: path.join(ROOT, "test", "cds-plugin-src.js") } }),
  };
  delete env["CDS_CONFIG"];
  const output = execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "cds-with-okf.js"), "env", "plugins", "--json"],
    {
      cwd: ROOT,
      env,
      encoding: "utf8",
    },
  );
  const plugins = JSON.parse(output) as Record<string, { impl: string }>;
  expect(plugins["cap-okf"]?.impl).toBe(path.join(ROOT, "cds-plugin.js"));
  expect(plugins["other"]?.impl).toBe(path.join(ROOT, "test", "cds-plugin-src.js"));
});

// Task 3.1: cds compile merges the curated okf/ folder at the project root, as cds build does.
/** A copy of the bookshop fixture with one curated guide in okf/guides/. */
function curatedApp(): string {
  // Inside the repository (gen/ is git-ignored): cds compile reads okf/ at its working
  // directory, and outside the repository cds-dk would load another @sap/cds than the plugin.
  fs.mkdirSync(path.join(ROOT, "gen"), { recursive: true });
  const app = fs.mkdtempSync(path.join(ROOT, "gen", "compile-curated-"));
  fs.cpSync(FIXTURE, app, { recursive: true });
  fs.mkdirSync(path.join(app, "okf", "guides"), { recursive: true });
  fs.writeFileSync(
    path.join(app, "okf", "guides", "ordering.md"),
    "---\ntype: Guide\ntitle: Ordering\ndescription: How to order.\n---\n",
  );
  return app;
}

describe("cds compile --to okf with a curated okf/ folder", () => {
  let app: string;
  beforeEach(() => (app = curatedApp()));
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("prints the curated paths in the tree, with the folder index made for them", () => {
    const result = cdsWithOkf(["compile", ".", "--to", "okf"], {}, { cwd: app });
    expect(result.status).toBe(0);
    const tree = result.stdout.trim().split("\n");
    expect(tree).toEqual(
      expect.arrayContaining(["guides/index.md", "guides/ordering.md", "index.md"]),
    );
  });

  test("with -o, writes text files as they are and leaves out a file that isn't text, with a note", () => {
    fs.writeFileSync(path.join(app, "okf", "guides", "q.sql"), "select 1;\n");
    fs.writeFileSync(
      path.join(app, "okf", "guides", "logo.png"),
      Buffer.from([0x89, 0x50, 0xff, 0xfe]),
    );
    const out = path.join(app, "out");
    const result = cdsWithOkf(["compile", ".", "--to", "okf", "-o", out], {}, { cwd: app });
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(out, "guides", "q.sql"), "utf8")).toBe("select 1;\n");
    expect(fs.existsSync(path.join(out, "guides", "logo.png"))).toBe(false);
    expect(result.stderr).toContain("[okf] okf/guides/logo.png — isn't text");
  });
});

describe("cds compile --to okf with a curated okf/ folder: exact files and mistakes", () => {
  let app: string;
  beforeEach(() => (app = curatedApp()));
  afterEach(() => fs.rmSync(app, { recursive: true, force: true }));

  test("with -o, writes curated text byte for byte: a BOM and a doubled extension stay", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b\n")]);
    fs.writeFileSync(path.join(app, "okf", "guides", "data.csv"), withBom);
    fs.writeFileSync(
      path.join(app, "okf", "guides", "notes.md.md"),
      "---\ntype: Note\ntitle: N\ndescription: N.\n---\n",
    );
    const out = path.join(app, "out");
    const result = cdsWithOkf(["compile", ".", "--to", "okf", "-o", out], {}, { cwd: app });
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(out, "guides", "data.csv"))).toEqual(withBom);
    expect(fs.existsSync(path.join(out, "guides", "notes.md.md"))).toBe(true);
  });

  test("definitions whose paths clash stop the compile with the .cds file and line, plainly", () => {
    fs.writeFileSync(
      path.join(app, "db", "clash.cds"),
      "namespace clash;\nentity Books { key ID : Integer; }\nentity books { key ID : Integer; }\n",
    );
    const result = cdsWithOkf(
      ["compile", "db", "--to", "okf"],
      { CDS_OKF_INCLUDE: "all" },
      { cwd: app },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/\[okf\] db\/clash\.cds:3 — clash\.books: .* \(M1\)\./);
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  test("a curated file under okf/model/ stops the compile with the [okf] message", () => {
    fs.mkdirSync(path.join(app, "okf", "model"));
    fs.writeFileSync(path.join(app, "okf", "model", "notes.md"), "---\ntype: Guide\n---\n");
    const result = cdsWithOkf(["compile", ".", "--to", "okf"], {}, { cwd: app });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[okf] okf/model/notes.md:1 — model/ belongs to the generator");
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});
