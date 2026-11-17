// What `cds add okf` writes (task 3.3). Pure: the project's current state in, the files to write
// and notes for the developer out. Running it again on the result plans nothing.
//
// Maintainer decision 2026-11-17: the cds.okf settings go into package.json with their default
// values (JSON has no comments; the README explains each one). Rules, so nothing the developer
// set or wrote is ever changed:
// - cds.okf is added only when no CAP config file mentions okf yet, in any profile; CAP reads
//   package.json last, so a new block there would override .cdsrc.json or .cdsrc.yaml;
// - okf/index.md and the example concept are written only into a missing or empty okf/;
// - .gitignore gets the bundle folder only when no line decides about it yet (a negation too);
// - an app's own build.tasks list gets { "for": "okf" } (ADR-0005 (b)), in package.json or
//   .cdsrc.json; in .cdsrc.yaml or .cdsrc.js, a note asks the developer to add it;
// - files keep their indentation, line endings and final newline.
import { setupError } from "../build/errors";

/** What `cds add okf` needs to know about the project. */
export interface ProjectState {
  /** The text of package.json, or undefined when there is none. */
  packageJson: string | undefined;
  /** The text of .gitignore, or undefined when there is none. */
  gitignore: string | undefined;
  /** Whether okf/ is missing or empty: only then are the index and the example written. */
  curatedFolderIsEmpty: boolean;
  /** The text of the other CAP config files that exist, by name: ".cdsrc.json", ".cdsrc.yaml"… */
  otherConfig: Readonly<Record<string, string>>;
  /** cds.build.target, e.g. "gen", or "." for in-place builds. */
  buildTarget: string;
}

/** One file to write, with its whole new text, at its path from the project root. */
export interface Change {
  path: string;
  content: string;
}

export interface Plan {
  changes: Change[];
  /** What the developer has to do by hand, as [okf] messages with a fix. */
  notes: string[];
}

/** cds.okf with the default values: export the services, serve nothing (ADR-0002). */
export const OKF_DEFAULTS = {
  include: "services",
  serve: { static: false, mcp: false },
} as const;

const OKF_TASK = { for: "okf" } as const;

const CURATED_INDEX = `---
okf_version: "0.2"
---
# Guides

* [Getting started](guides/getting-started.md) - What this folder is for, and how to add a concept.

# Model

* [Model](model/index.md) - Generated from the CDS model by cap-okf; not edited by hand.
`;

const EXAMPLE_CONCEPT = `---
type: Guide
title: Getting started
description: What this folder is for, and how to add a concept.
tags:
  - guide
---

# Getting started

This folder holds the app's curated knowledge: Markdown concepts that the CDS model can't
express, such as how a process works or why a rule exists. \`cds build\` merges it with the
concepts generated from the model under \`model/\` into one Open Knowledge Format bundle in
\`gen/okf\`.

To add a concept, create a Markdown file with frontmatter. Only \`type\` is required; \`title\`
and \`description\` are recommended. Link it from [the index](../index.md), and link to the
model where it helps, e.g. \`[Books](/model/CatalogService/Books.md)\`.

Replace or delete this example when you add your own.
`;

/** The files `cds add okf` writes for a project in `state`, in a fixed order, and its notes. */
export function planOkfSetup(state: ProjectState): Plan {
  const plan: Plan = { changes: [], notes: [] };
  if (state.curatedFolderIsEmpty) {
    plan.changes.push({ path: "okf/index.md", content: CURATED_INDEX });
    plan.changes.push({ path: "okf/guides/getting-started.md", content: EXAMPLE_CONCEPT });
  }
  const gitignore = withGitignoreEntry(state.gitignore, bundleFolderOf(state.buildTarget));
  if (gitignore !== undefined) plan.changes.push({ path: ".gitignore", content: gitignore });

  const okfIsSet = Object.entries(state.otherConfig).some(([name, text]) =>
    mentionsOkf(name, text),
  );
  const packageJson = updatedJson(
    requiredPackageJson(state.packageJson),
    "package.json",
    (json) => {
      const cds = cdsObjectOf(json);
      const addedTask = addOkfTask(cds);
      if (okfIsSet || hasOkfSettings(cds)) return addedTask;
      cds["okf"] = OKF_DEFAULTS;
      return true;
    },
  );
  if (packageJson !== undefined) plan.changes.push({ path: "package.json", content: packageJson });

  planOtherConfig(state.otherConfig, plan);
  return plan;
}

// The folder cds build writes the bundle to (src/build/build-task.ts): <target>/okf, or gen/okf
// for in-place builds.
function bundleFolderOf(buildTarget: string): string {
  const target = buildTarget.replace(/^\.\//, "").replace(/\/+$/, "");
  return `${target === "." || target === "" ? "gen" : target}/okf`;
}

/** .gitignore with the bundle folder added, or undefined when a line already decides about it. */
function withGitignoreEntry(gitignore: string | undefined, folder: string): string | undefined {
  if (gitignore === undefined) return `${folder}\n`;
  const parent = folder.slice(0, folder.lastIndexOf("/"));
  // Git ignores trailing spaces only. "!gen/okf" is a decision too: the developer keeps it.
  const patterns = gitignore
    .split(/\r?\n/)
    .map((line) => line.trimEnd().replace(/^!/, "").replace(/^\//, "").replace(/\/$/, ""));
  if (patterns.some((pattern) => pattern === folder || pattern === parent)) return undefined;
  const eol = gitignore.includes("\r\n") ? "\r\n" : "\n";
  const separator = gitignore === "" || gitignore.endsWith("\n") ? "" : eol;
  return `${gitignore}${separator}${folder}${eol}`;
}

/** The edits for .cdsrc.json, and notes for config files cap-okf can't edit safely. */
function planOtherConfig(otherConfig: Readonly<Record<string, string>>, plan: Plan): void {
  for (const [name, text] of Object.entries(otherConfig)) {
    if (name.endsWith(".json")) {
      const updated = updatedJson(text, name, (json) => addOkfTask(json));
      if (updated !== undefined) plan.changes.push({ path: name, content: updated });
    } else if (/\btasks\b/.test(text) && !/\bokf\b/.test(text)) {
      plan.notes.push(
        `[okf] ${name} — may list its own build tasks, so cds build may skip the okf task.\n` +
          '  If it sets build.tasks, add { for: "okf" } to that list (ADR-0005).',
      );
    }
  }
}

/**
 * Adds { "for": "okf" } to every build.tasks list in `config` (the base and each [profile])
 * that lacks it. CAP asks the okf task only when an app lists no tasks of its own.
 */
function addOkfTask(config: Record<string, unknown>): boolean {
  let added = false;
  for (const block of [config, ...profileBlocks(config)]) {
    const tasks = objectAt(block, "build")?.["tasks"];
    if (!Array.isArray(tasks)) continue;
    if (tasks.some((task) => objectOrUndefined(task)?.["for"] === "okf")) continue;
    tasks.push({ ...OKF_TASK });
    added = true;
  }
  return added;
}

function hasOkfSettings(config: Record<string, unknown>): boolean {
  return [config, ...profileBlocks(config)].some((block) => "okf" in block);
}

/** Whether a CAP config file sets anything under okf, in its base or in a [profile]. */
function mentionsOkf(name: string, text: string): boolean {
  if (!name.endsWith(".json")) return /\bokf\b/.test(text);
  try {
    const json = objectOrUndefined(JSON.parse(text));
    return json !== undefined && hasOkfSettings(json);
  } catch {
    // CAP itself refuses a broken config file before cds add gets here.
    return true;
  }
}

// "[production]": { … } and the like.
function profileBlocks(config: Record<string, unknown>): Record<string, unknown>[] {
  return Object.entries(config)
    .filter(([key]) => key.startsWith("["))
    .map(([, value]) => objectOrUndefined(value))
    .filter((value): value is Record<string, unknown> => value !== undefined);
}

function requiredPackageJson(text: string | undefined): string {
  if (text === undefined) {
    throw setupError(
      "[okf] package.json — is missing.\n" +
        "  Run cds add okf in the root folder of a CAP project (where package.json is).",
    );
  }
  return text;
}

// package.json's "cds" object, created when there is none.
function cdsObjectOf(json: Record<string, unknown>): Record<string, unknown> {
  json["cds"] ??= {};
  const cds = objectOrUndefined(json["cds"]);
  if (cds === undefined) {
    throw setupError(
      '[okf] package.json — "cds" isn\'t an object.\n' +
        '  Make "cds" an object holding the CAP configuration, then run cds add okf again.',
    );
  }
  return cds;
}

/**
 * `text` parsed, edited by `edit` (which says whether it changed anything) and written back in
 * the file's own style; undefined when nothing changed.
 */
function updatedJson(
  text: string,
  name: string,
  edit: (json: Record<string, unknown>) => boolean,
): string | undefined {
  const json = parsedJsonObject(text, name);
  if (!edit(json)) return undefined;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const body = JSON.stringify(json, null, indentationOf(text)).split("\n").join(eol);
  return /\r?\n$/.test(text) ? body + eol : body;
}

function parsedJsonObject(text: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw setupError(
      `[okf] ${name} — isn't valid JSON (${(error as Error).message}).\n` +
        `  Fix ${name}, then run cds add okf again; nothing was changed.`,
    );
  }
  const json = objectOrUndefined(parsed);
  if (json === undefined) {
    throw setupError(
      `[okf] ${name} — doesn't hold a JSON object.\n` +
        `  Fix ${name}, then run cds add okf again; nothing was changed.`,
    );
  }
  return json;
}

function objectAt(
  block: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  return objectOrUndefined(block[key]);
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// The indentation of the first indented line, so the file keeps its style; 2 spaces otherwise.
function indentationOf(text: string): string | number {
  const indented = /\n([ \t]+)\S/.exec(text);
  return indented === null ? 2 : indented[1]!;
}
