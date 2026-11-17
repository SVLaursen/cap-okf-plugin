import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { readerView, snapshotOf } from "../../src/serve/reader-view";
import { startupBundleSource } from "../../src/serve/source";

// Task 4.3 / ADR-0007: a deployed app serves its built okf-bundle/; without one (development),
// the bundle is generated in memory from the app's model plus okf/, with a warning if that
// happens under NODE_ENV=production. Curated files with errors are left out and reported.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

async function appCds(root: string): Promise<typeof cds> {
  const model = await cds.load(path.join(root, "srv"));
  return Object.create(cds, { root: { value: root }, model: { value: model } });
}

/**
 * A log that keeps its warnings, emptied before each test. The knowledge lint's warnings (K1–K3,
 * ADR-0012) are kept apart, so the other checks stay exact.
 */
function collectingLog(): {
  log: { warn(message: string): void };
  warnings: string[];
  lint: string[];
} {
  const warnings: string[] = [];
  const lint: string[] = [];
  beforeEach(() => {
    warnings.length = 0;
    lint.length = 0;
  });
  const log = {
    warn: (message: string) => (/\(K\d\)\./.test(message) ? lint : warnings).push(message),
  };
  return { log, warnings, lint };
}

describe("startupBundleSource", () => {
  let root: string;
  const { log, warnings, lint } = collectingLog();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-serve-"));
    fs.cpSync(FIXTURE, root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("a built okf-bundle/ is served as it is", async () => {
    fs.mkdirSync(path.join(root, "okf-bundle"));
    fs.writeFileSync(path.join(root, "okf-bundle", "index.md"), "# Built\n");
    const source = await startupBundleSource(await appCds(root), log, {});
    expect(await source.list()).toEqual(["index.md"]);
    expect({ warnings, lint }).toEqual({ warnings: [], lint: [] }); // linted by cds build
  });

  test("without one, the bundle is generated in memory, with doc comments and okf/", async () => {
    fs.mkdirSync(path.join(root, "okf"));
    fs.writeFileSync(
      path.join(root, "okf", "notes.md"),
      "---\ntype: Note\ntitle: N\ndescription: N.\n---\n",
    );
    const source = await startupBundleSource(await appCds(root), log, {});
    expect(await source.list()).toEqual(
      expect.arrayContaining(["index.md", "notes.md", "model/CatalogService/Authors.md"]),
    );
    expect(await source.read("model/CatalogService/Authors.md")).toContain(
      "description: A person who wrote one or more books.",
    );
    expect(warnings).toEqual([]);
    // ADR-0012: the knowledge lint's warnings are logged once for a generated bundle.
    expect(lint).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[okf\] okf\/notes\.md:\d+ — this note has no tags.*\(K1\)/),
        expect.stringMatching(
          /^\[okf\] okf\/notes\.md:\d+ — this note links to no generated concept.*\(K2\)/,
        ),
        expect.stringMatching(
          /^\[okf\] model\/CatalogService\/Authors\.md:\d+ — country looks like a code field.*\(K3\)/,
        ),
      ]),
    );
  });

  test("generating at startup under NODE_ENV=production gives one warning", async () => {
    await startupBundleSource(await appCds(root), log, { NODE_ENV: "production" });
    expect(warnings).toEqual([
      expect.stringMatching(
        /^\[okf\] okf-bundle — is missing, so the bundle was generated at startup\./,
      ),
    ]);
  });
});

describe("startupBundleSource: curated files with errors", () => {
  let root: string;
  const { log, warnings } = collectingLog();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-serve-"));
    fs.cpSync(FIXTURE, root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("a curated file with errors is left out and reported; the rest is served", async () => {
    fs.mkdirSync(path.join(root, "okf", "model"), { recursive: true });
    fs.writeFileSync(path.join(root, "okf", "broken.md"), "no frontmatter\n");
    fs.writeFileSync(path.join(root, "okf", "model", "x.md"), "---\ntype: X\n---\n");
    fs.writeFileSync(
      path.join(root, "okf", "ok.md"),
      "---\ntype: Note\ntitle: OK\ndescription: OK.\n---\n",
    );
    const source = await startupBundleSource(await appCds(root), log, {});
    const files = await source.list();
    expect(files).toContain("ok.md");
    expect(files).not.toContain("broken.md");
    expect(files).not.toContain("model/x.md");
    expect(warnings).toEqual([
      // Problems with okf/'s layout first, then those the OKF validator finds.
      expect.stringMatching(/^\[okf\] okf\/model\/x\.md:1 — .*\(L1\)/),
      expect.stringMatching(/^\[okf\] okf\/broken\.md:1 — .*\(R1\)/),
    ]);
  });

  // Task 4.11: in development the in-memory bundle leaves such a file out too, and logs why.
  test("a curated file with a broken authorization marker is left out and reported", async () => {
    fs.mkdirSync(path.join(root, "okf"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "okf", "leaky.md"),
      "---\ntype: Note\ntitle: Leaky\ndescription: L.\n---\n- <!-- okf:auth:start -->\nSecret.\n- <!-- okf:auth:end -->\n",
    );
    const source = await startupBundleSource(await appCds(root), log, {});
    expect(await source.list()).not.toContain("leaky.md");
    expect(warnings).toEqual([
      expect.stringMatching(/^\[okf\] okf\/leaky\.md:6 — .*\(L3\)/),
      expect.stringMatching(/^\[okf\] okf\/leaky\.md:8 — .*\(L3\)/),
    ]);
  });
});

describe("startupBundleSource: indexes after leaving files out", () => {
  let root: string;
  const { log } = collectingLog();
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-serve-"));
    fs.cpSync(FIXTURE, root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // Review of ADR-0012: the indexes are rebuilt without the left-out file, so a reader view
  // still recognises them as generated and keeps hidden concepts out of their counts.
  test("the generated indexes no longer list a left-out file, and stay recognisable", async () => {
    fs.mkdirSync(path.join(root, "okf", "finance", "secret"), { recursive: true });
    fs.writeFileSync(path.join(root, "okf", "finance", "secret", "b.md"), "no frontmatter\n");
    fs.writeFileSync(
      path.join(root, "okf", "finance", "secret", "c.md"),
      "---\ntype: Note\ntitle: C\ndescription: C.\nrequires: boss\n---\n",
    );
    const source = await startupBundleSource(await appCds(root), log, {});
    const files = await Promise.all(
      (await source.list()).map(async (file) => ({ path: file, text: (await source.read(file))! })),
    );
    expect(files.find((file) => file.path === "finance/index.md")?.text).toContain(
      "1 concept: Note",
    );
    const view = readerView(snapshotOf(files), { isAuthenticated: true, is: () => false });
    expect(view.paths.filter((file) => file.startsWith("finance"))).toEqual([]);
    expect(view.read("index.md")).not.toContain("finance");
  });
});
