import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { readCuratedFolder } from "../../src/build/curated";
import { mergeBundle } from "../../src/bundle/merge";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { exportModel, OKF_VERSION } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// Task 3.1 on the demo app: its curated okf/ links into model/, so with the generated concepts
// merged in, every link resolves (G2 open issue 7). The only findings left are W1 warnings on
// the texts entities CAP generates for localized elements, which have no description of their
// own (a known exporter follow-up, not part of the merge).

const DEMO = path.join(__dirname, "..", "..", "demo");

test("the demo app's merged bundle validates without findings", async () => {
  const model = (await cds.load(path.join(DEMO, "srv"), { docs: true })) as unknown as Csn;
  const generated = exportModel(model, {
    include: "services",
    now: new Date("2026-01-01T00:00:00Z"),
    version: "0.0.0-test",
    texts: defaultLanguageTexts(cds, model),
  });
  const curated = await readCuratedFolder(path.join(DEMO, "okf"));
  const merged = mergeBundle(generated, curated, OKF_VERSION);
  expect(merged.findings).toEqual([]);
  const findings = validateBundle(merged.files).map((each) => `${each.rule} ${each.file}`);
  expect(findings).toEqual([
    "W1 model/AdminService/Genres/texts.md",
    "W1 model/CatalogService/Genres/texts.md",
    "W1 model/demo/bookshop/Genres/texts.md",
  ]);
  expect(merged.curatedPaths.has("guides/ordering.md")).toBe(true);
});

describe("readCuratedFolder", () => {
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-curated-"));
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  test("no folder: no files", async () => {
    expect(await readCuratedFolder(path.join(folder, "missing"))).toEqual([]);
  });

  test("Markdown as text; other files with their bytes, and their text when it is UTF-8", async () => {
    fs.mkdirSync(path.join(folder, "refs"));
    fs.writeFileSync(path.join(folder, "a.md"), "---\ntype: X\n---\n");
    fs.writeFileSync(path.join(folder, "refs", "q.sql"), "select 1;\n");
    fs.writeFileSync(path.join(folder, "refs", "logo.png"), Buffer.from([0x89, 0xff, 0xfe]));
    fs.writeFileSync(path.join(folder, ".hidden.md"), "---\ntype: X\n---\n");
    const files = await readCuratedFolder(folder);
    expect(files.map((file) => [file.path, file.text, file.bytes?.length])).toEqual([
      ["a.md", "---\ntype: X\n---\n", undefined],
      ["refs/logo.png", "", 3],
      ["refs/q.sql", "select 1;\n", 10],
    ]);
  });
});

describe("readCuratedFolder, guarded reads", () => {
  let folder: string;
  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-curated-"));
  });
  afterEach(() => fs.rmSync(folder, { recursive: true, force: true }));

  test("a symbolic link is never followed, also for files that aren't Markdown", async () => {
    const outside = path.join(folder, "..", `${path.basename(folder)}-secret.txt`);
    fs.writeFileSync(outside, "secret\n");
    try {
      fs.mkdirSync(path.join(folder, "okf"));
      fs.symlinkSync(outside, path.join(folder, "okf", "linked.txt"));
      expect(await readCuratedFolder(path.join(folder, "okf"))).toEqual([]);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  test("okf as a file, not a folder, is an [okf] setup error naming okf", async () => {
    fs.writeFileSync(path.join(folder, "okf"), "oops\n");
    await expect(readCuratedFolder(path.join(folder, "okf"))).rejects.toMatchObject({
      name: "SetupError",
      message: expect.stringMatching(/^\[okf\] okf — is a file, not a folder\.\n {2}/),
    });
  });
});
