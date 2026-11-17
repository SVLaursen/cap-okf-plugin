// What `cds compile --to okf` (task 2.8) and `cds build` (task 2.9) share: both turn a model
// loaded with doc comments into the bundle, with the same settings, so they write the same bytes
// (ADR-0007, one model for generation and build).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Concept } from "../core/concept";
import type { Csn } from "../export/csn";
import { exportModel } from "../export/exporter";
import { defaultLanguageTexts } from "../export/i18n";
import { INCLUDE_VALUES, type Include } from "../export/selection";
import type { Cds } from "../index";
import { clockFrom } from "./clock";
import { setupError } from "./errors";

/**
 * The bundle's concepts for `model`, which must be inferred and loaded with doc comments.
 * Reads cds.okf.include, the clock (SOURCE_DATE_EPOCH when set) and cap-okf's own version.
 */
export function generateConcepts(cds: Cds, model: Csn): Concept[] {
  return exportModel(model, {
    include: includeFrom(cds),
    now: clockFrom(process.env, () => new Date()),
    version: ownVersion(),
    texts: defaultLanguageTexts(cds, model),
  });
}

// cds.okf.include: "services" (default) or "all" (task 2.6), from cds.env, so profiles and
// environment variables such as CDS_OKF_INCLUDE apply.
function includeFrom(cds: Cds): Include {
  const okf = (cds.env as unknown as { okf?: { include?: unknown } }).okf;
  const include = okf?.include ?? "services";
  if (!(INCLUDE_VALUES as readonly unknown[]).includes(include)) {
    throw setupError(
      `[okf] cds.okf.include — ${JSON.stringify(include)} is not a known value.\n` +
        '  Use "services" (the default) or "all".',
    );
  }
  return include as Include;
}

// cap-okf's own version, for generated.by. This file is src/build/generate.ts or, built,
// lib/build/generate.js: in both, the package.json is two folders up.
function ownVersion(): string {
  const packageJson = path.join(__dirname, "..", "..", "package.json");
  return (JSON.parse(readFileSync(packageJson, "utf8")) as { version: string }).version;
}
