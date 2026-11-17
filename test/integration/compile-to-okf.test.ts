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

function cdsWithOkf(args: string[], extraEnv: Record<string, string> = {}) {
  // Without CDS_CONFIG: test/setup-env.js points it at src/, but a child process can't run TS.
  const env: Record<string, string | undefined> = {
    ...process.env,
    SOURCE_DATE_EPOCH: EPOCH,
    ...extraEnv,
  };
  delete env["CDS_CONFIG"];
  return spawnSync(process.execPath, [path.join(ROOT, "scripts", "cds-with-okf.js"), ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
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
    expect(result.stdout.trim().split("\n")).toEqual(expected);
  });

  test("with -o, writes exactly the bundle the exporter makes, doc comments and texts included", async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-compile-"));
    try {
      const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf", "-o", out]);
      expect(result.status).toBe(0);
      const written = readTree(out);
      expect(written).toEqual(await expectedBundle());
      const authors = written.find((file) => file.path === "model/sample/bookshop/Authors.md")!;
      expect(authors.text).toContain("description: A person who wrote one or more books.");
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  test("two compiles with the same SOURCE_DATE_EPOCH write byte-identical bundles", () => {
    const outs = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-compile-")));
    try {
      for (const out of outs) cdsWithOkf(["compile", FIXTURE, "--to", "okf", "-o", out]);
      expect(readTree(outs[0]!)).toEqual(readTree(outs[1]!));
    } finally {
      for (const out of outs) fs.rmSync(out, { recursive: true, force: true });
    }
  });

  test("a bad SOURCE_DATE_EPOCH fails with an [okf] message", () => {
    const result = cdsWithOkf(["compile", FIXTURE, "--to", "okf"], { SOURCE_DATE_EPOCH: "soon" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[okf] SOURCE_DATE_EPOCH — ");
  });
});

describe("the compile target in-process", () => {
  let model: Csn;

  beforeAll(async () => {
    await cds.plugins;
    model = (await cds.load(FIXTURE)) as unknown as Csn;
  });

  afterEach(() => {
    delete (cds.env as unknown as Record<string, unknown>)["okf"];
  });

  type Target = (csn: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  const target = () => (cds.compile.to as unknown as Record<string, Target>)["okf"]!;

  test("is registered by the plugin", () => {
    expect(typeof target()).toBe("function");
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
      /\[okf\] cds\.okf\.include — .*"services" or "all"/,
    );
  });

  test("a model without $sources is refused, since it can't be reloaded with doc comments", async () => {
    await expect(target()(JSON.parse(JSON.stringify(model)))).rejects.toThrow(
      /\[okf\] .*\$sources/,
    );
  });
});

test("scripts/cds-with-okf.js runs the cds CLI with cap-okf loaded", () => {
  const env: Record<string, string | undefined> = { ...process.env };
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
});
