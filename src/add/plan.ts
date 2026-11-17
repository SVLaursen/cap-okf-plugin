import { setupError } from "../build/errors";

// What `cds add okf` writes (task 3.3). Pure: the project's current state in, the files to write
// out. Running it again on the result plans nothing.
//
// Maintainer decision 2026-11-17: the cds.okf settings go into package.json with their default
// values (JSON has no comments; the README explains each one). An existing cds.okf block, an
// existing okf/index.md and an existing .gitignore entry are never changed.

/** What `cds add okf` needs to know about the project. */
export interface ProjectState {
  /** The text of package.json, or undefined when there is none. */
  packageJson: string | undefined;
  /** The text of .gitignore, or undefined when there is none. */
  gitignore: string | undefined;
  /** Whether okf/index.md exists: the app already has a curated folder. */
  hasCuratedIndex: boolean;
}

/** One file to write, with its whole new text, at its path from the project root. */
export interface Change {
  path: string;
  content: string;
}

/** cds.okf with the default values: export the services, serve nothing (ADR-0002). */
export const OKF_DEFAULTS = {
  include: "services",
  serve: { static: false, mcp: false },
} as const;

const GITIGNORE_ENTRY = "gen/okf";

// Lines that already keep gen/okf out of git.
const IGNORING_LINES = [
  "gen",
  "gen/",
  "/gen",
  "/gen/",
  "gen/okf",
  "gen/okf/",
  "/gen/okf",
  "/gen/okf/",
];

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

/** The files `cds add okf` writes for a project in `state`, in a fixed order; [] when none. */
export function planOkfSetup(state: ProjectState): Change[] {
  const changes: Change[] = [];
  if (!state.hasCuratedIndex) {
    // The example only comes with a new curated folder, so a deleted example stays deleted.
    changes.push({ path: "okf/index.md", content: CURATED_INDEX });
    changes.push({ path: "okf/guides/getting-started.md", content: EXAMPLE_CONCEPT });
  }
  const gitignore = withGitignoreEntry(state.gitignore);
  if (gitignore !== undefined) changes.push({ path: ".gitignore", content: gitignore });
  const packageJson = withOkfDefaults(state.packageJson);
  if (packageJson !== undefined) changes.push({ path: "package.json", content: packageJson });
  return changes;
}

/** .gitignore with gen/okf added, or undefined when it already keeps gen/okf out. */
function withGitignoreEntry(gitignore: string | undefined): string | undefined {
  if (gitignore === undefined) return `${GITIGNORE_ENTRY}\n`;
  const lines = gitignore.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => IGNORING_LINES.includes(line))) return undefined;
  const separator = gitignore === "" || gitignore.endsWith("\n") ? "" : "\n";
  return `${gitignore}${separator}${GITIGNORE_ENTRY}\n`;
}

/** package.json with cds.okf set to the defaults, or undefined when cds.okf already exists. */
function withOkfDefaults(text: string | undefined): string | undefined {
  if (text === undefined) {
    throw setupError(
      "[okf] package.json — is missing.\n" +
        "  Run cds add okf in the root folder of a CAP project (where package.json is).",
    );
  }
  const packageJson = parsedPackageJson(text);
  const cds = packageJson["cds"] ?? {};
  if (typeof cds !== "object" || cds === null || Array.isArray(cds)) {
    throw setupError(
      '[okf] package.json — "cds" isn\'t an object.\n' +
        '  Make "cds" an object holding the CAP configuration, then run cds add okf again.',
    );
  }
  if ("okf" in cds) return undefined;
  const updated = { ...packageJson, cds: { ...cds, okf: OKF_DEFAULTS } };
  return JSON.stringify(updated, null, indentationOf(text)) + "\n";
}

function parsedPackageJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw setupError(
      `[okf] package.json — isn't valid JSON (${(error as Error).message}).\n` +
        "  Fix package.json, then run cds add okf again; nothing was changed.",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw setupError(
      "[okf] package.json — doesn't hold a JSON object.\n" +
        "  Fix package.json, then run cds add okf again; nothing was changed.",
    );
  }
  return parsed as Record<string, unknown>;
}

// The indentation of the first indented line, so the file keeps its style; 2 spaces otherwise.
function indentationOf(text: string): string | number {
  const indented = /\n([ \t]+)\S/.exec(text);
  return indented === null ? 2 : indented[1]!;
}
