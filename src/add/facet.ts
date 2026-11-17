// The `cds add okf` facet (task 3.3, ADR-0005 (c)): reads the project, lets planOkfSetup decide,
// writes the result. cds.add exists only while `cds add` runs, so outside it nothing happens.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Cds } from "../index";
import { planOkfSetup, type ProjectState } from "./plan";

/** CAP's facet API, cds.add, which exists only while `cds add` runs. */
interface AddApi {
  register?(id: string, plugin: unknown): void;
  Plugin: new () => object;
}

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
      const changes = planOkfSetup(await projectState(cds.root));
      for (const change of changes) {
        const file = path.join(cds.root, ...change.path.split("/"));
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, change.content);
        console.log(`[okf] ${change.path} — written.`);
      }
      if (changes.length === 0)
        console.log("[okf] the project is already set up; nothing written.");
    }
  };
}

async function projectState(root: string): Promise<ProjectState> {
  return {
    packageJson: await textOrUndefined(path.join(root, "package.json")),
    gitignore: await textOrUndefined(path.join(root, ".gitignore")),
    hasCuratedIndex: existsSync(path.join(root, "okf", "index.md")),
  };
}

async function textOrUndefined(file: string): Promise<string | undefined> {
  return existsSync(file) ? await readFile(file, "utf8") : undefined;
}
