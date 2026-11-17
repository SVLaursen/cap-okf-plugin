import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { startupBundleSource } from "../../src/serve/source";

// Task 4.3 / ADR-0007: a deployed app serves its built okf-bundle/; without one (development),
// the bundle is generated in memory from the app's model plus okf/, with a warning if that
// happens under NODE_ENV=production. Curated files with errors are left out and reported.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

async function appCds(root: string): Promise<typeof cds> {
  const model = await cds.load(path.join(root, "srv"));
  return Object.create(cds, { root: { value: root }, model: { value: model } });
}

describe("startupBundleSource", () => {
  let root: string;
  let warnings: string[];
  const log = { warn: (message: string) => warnings.push(message) };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-serve-"));
    fs.cpSync(FIXTURE, root, { recursive: true });
    warnings = [];
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("a built okf-bundle/ is served as it is", async () => {
    fs.mkdirSync(path.join(root, "okf-bundle"));
    fs.writeFileSync(path.join(root, "okf-bundle", "index.md"), "# Built\n");
    const source = await startupBundleSource(await appCds(root), log, {});
    expect(await source.list()).toEqual(["index.md"]);
    expect(warnings).toEqual([]);
  });

  test("without one, the bundle is generated in memory, with doc comments and okf/", async () => {
    fs.mkdirSync(path.join(root, "okf"));
    fs.writeFileSync(
      path.join(root, "okf", "notes.md"),
      "---\ntype: Note\ntitle: N\ndescription: N.\n---\n",
    );
    const source = await startupBundleSource(await appCds(root), log, {});
    expect(await source.list()).toEqual(
      expect.arrayContaining(["index.md", "notes.md", "model/sample/bookshop/Authors.md"]),
    );
    expect(await source.read("model/sample/bookshop/Authors.md")).toContain(
      "description: A person who wrote one or more books.",
    );
    expect(warnings).toEqual([]);
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
  let warnings: string[];
  const log = { warn: (message: string) => warnings.push(message) };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-serve-"));
    fs.cpSync(FIXTURE, root, { recursive: true });
    warnings = [];
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
});
