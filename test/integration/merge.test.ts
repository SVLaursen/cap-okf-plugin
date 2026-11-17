import path from "node:path";
import cds from "@sap/cds";
import { readCuratedFolder } from "../../src/build/curated";
import { mergeBundle } from "../../src/bundle/merge";
import { validateBundle } from "../../src/core/validate";
import type { Csn } from "../../src/export/csn";
import { exportModel, OKF_VERSION } from "../../src/export/exporter";
import { defaultLanguageTexts } from "../../src/export/i18n";

// Task 3.1 on the demo app: its curated okf/ links into model/, so with the generated concepts
// merged in, every link resolves (G2 open issue 7).

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
  expect(validateBundle(merged.files)).toEqual([]);
  expect(merged.curatedPaths.has("guides/ordering.md")).toBe(true);
});
