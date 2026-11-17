// The `cds add okf` facet (task 3.3, ADR-0005 (c)): reads the project, lets planOkfSetup decide,
// writes the result. cds.add exists only while `cds add` runs, so outside it nothing happens.
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Cds } from "../index";
import { planOkfSetup, type ProjectState } from "./plan";

/** CAP's facet API, cds.add, which exists only while `cds add` runs. */
interface AddApi {
  register?(id: string, plugin: unknown): void;
  Plugin: new () => object;
}

/** The CAP config files besides package.json, which CAP reads before it (cds-env.js). */
const OTHER_CONFIG_FILES = [".cdsrc.json", ".cdsrc.yaml", ".cdsrc.yml", ".cdsrc.js"];

/** Registers the "okf" facet, when the running cds command is `cds add`. */
export function registerAddFacet(cds: Cds): void {
  const add = (cds as unknown as { add?: AddApi }).add;
  if (add?.register === undefined) return;
  add.register("okf", okfFacet(cds, add));
}

function okfFacet(cds: Cds, add: AddApi) {
  return class OkfFacet extends add.Plugin {
    static help(): string {
      return "an Open Knowledge Format bundle of the model and curated notes";
    }

    async run(): Promise<void> {
      warnAboutProfile(cds);
      const plan = planOkfSetup(await projectState(cds));
      for (const change of plan.changes) {
        const file = path.join(cds.root, ...change.path.split("/"));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, change.content);
        console.log(`[okf] ${change.path} — written.`);
      }
      for (const note of plan.notes) console.warn(note);
      if (plan.changes.length === 0) {
        console.log("[okf] the project is already set up; nothing written.");
      }
    }
  };
}

// cds add --for <profile> puts a facet's settings under that profile; cap-okf's defaults are
// the same in every profile, so they always go to the base cds.okf.
function warnAboutProfile(cds: Cds): void {
  const profile = (cds as unknown as { cli?: { options?: { for?: unknown } } }).cli?.options?.for;
  if (typeof profile === "string" && profile !== "") {
    console.warn(
      `[okf] --for ${profile} — doesn't apply: cds.okf gets its default values for every profile.\n` +
        `  To change a setting for ${profile} only, add it under "[${profile}]" yourself.`,
    );
  }
}

async function projectState(cds: Cds): Promise<ProjectState> {
  const root = cds.root;
  const otherConfig: Record<string, string> = {};
  for (const name of OTHER_CONFIG_FILES) {
    const text = await textOrUndefined(path.join(root, name));
    if (text !== undefined) otherConfig[name] = text;
  }
  const build = (cds.env as unknown as { build?: { target?: string } }).build;
  return {
    packageJson: await textOrUndefined(path.join(root, "package.json")),
    gitignore: await textOrUndefined(path.join(root, ".gitignore")),
    curatedFolderIsEmpty: await isMissingOrEmpty(path.join(root, "okf")),
    otherConfig,
    buildTarget: build?.target ?? "gen",
  };
}

// Dotfiles (e.g. .DS_Store) don't count: the bundle never includes them.
async function isMissingOrEmpty(folder: string): Promise<boolean> {
  if (!existsSync(folder)) return true;
  const entries = await readdir(folder);
  return entries.every((entry) => entry.startsWith("."));
}

async function textOrUndefined(file: string): Promise<string | undefined> {
  return existsSync(file) ? await readFile(file, "utf8") : undefined;
}
