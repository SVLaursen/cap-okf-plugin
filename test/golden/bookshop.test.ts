import fs from "node:fs";
import path from "node:path";
import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import { validateBundle, type BundleFile } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// Task 2.10: the bookshop fixture's bundle, committed in test/golden/bookshop/ and compared on
// every run. Any change to the exporter's output shows up here as a diff to review.
//
// To accept a change on purpose: npm run test:update-golden, then review the diff and call it
// out in the PR (GOVERNANCE: changing a golden file needs the maintainer).

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");
const GOLDEN = path.join(__dirname, "bookshop");
const UPDATE = process.env["UPDATE_GOLDEN"] === "1";

// Fixed inputs, so the golden files don't change with the clock or cap-okf's version.
const NOW = new Date("2026-01-01T00:00:00Z");
const VERSION = "0.0.0-golden";

async function exportedBundle(): Promise<BundleFile[]> {
  const model = (await cds.load(FIXTURE, { docs: true })) as unknown as Csn;
  return exportModel(model, {
    include: "services",
    now: NOW,
    version: VERSION,
    texts: defaultLanguageTexts(cds, model),
  }).map((concept) => ({ path: concept.path, text: serializeConcept(concept) }));
}

function readGolden(): BundleFile[] {
  if (!fs.existsSync(GOLDEN)) return [];
  return fs
    .readdirSync(GOLDEN, { recursive: true, encoding: "utf8" })
    .filter((file) => fs.statSync(path.join(GOLDEN, file)).isFile())
    .map((file) => ({
      path: file.split(path.sep).join("/"),
      text: fs.readFileSync(path.join(GOLDEN, file), "utf8"),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

// Replaces the whole folder, so a file the exporter no longer makes doesn't linger.
function writeGolden(files: BundleFile[]): void {
  fs.rmSync(GOLDEN, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(GOLDEN, ...file.path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.text);
  }
}

describe("the golden bookshop bundle", () => {
  let exported: BundleFile[];

  beforeAll(async () => {
    exported = await exportedBundle();
    if (UPDATE) writeGolden(exported);
  });

  test("has the same files as the exporter makes", () => {
    const sortedPaths = (files: BundleFile[]) => files.map((file) => file.path).sort();
    expect(sortedPaths(readGolden())).toEqual(sortedPaths(exported));
  });

  // One comparison per file, so a failure names the file and shows its diff.
  test("every file is byte-identical to the exporter's output", () => {
    const golden = new Map(readGolden().map((file) => [file.path, file.text]));
    for (const file of exported) {
      expect({ path: file.path, text: golden.get(file.path) }).toEqual(file);
    }
  });

  test("is a valid OKF v0.2 bundle, without even a warning", () => {
    expect(validateBundle(readGolden())).toEqual([]);
  });
});
