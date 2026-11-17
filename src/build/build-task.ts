// The `okf` build task for `cds build` (task 2.9, ADR-0005 (b), ADR-0007).
// - It writes the bundle to <build target>/okf (gen/okf), for review and CI, whatever src or dest
//   a task list or --dest gives: those are for deployable modules, and could point into the
//   curated okf/ folder. Both of its folders are emptied first, so no file from an earlier build
//   survives, also with --clean false or a deployed app outside gen/.
// - It documents the model the deployed app has: the build's default model paths, without the
//   project root itself (which would pull in loose .cds files) and without feature toggles.
// - In staging builds it puts the same files into the Node.js app that is deployed,
//   <nodejs dest>/okf-bundle/ (gen/srv/okf-bundle/), where the server finds them in production.
// - It merges the curated okf/ folder into the bundle (task 3.1, src/bundle/merge.ts).
// - It validates the bundle: warnings are reported, errors fail the build before the bundle is
//   put into the deployed app. Messages name okf/<path> for curated files.
// - In-place builds (build.target: ".") write <root>/gen/okf only; the curated okf/ folder is
//   never touched.
import { rm } from "node:fs/promises";
import path from "node:path";
import type { MergedBundle, MergedFile } from "../bundle/merge";
import { lintKnowledge } from "../core/lint";
import { validateBundle } from "../core/validate";
import type { Csn } from "../export/csn";
import { ModelClashError } from "../export/exporter";
import type { Cds } from "../index";
import { SetupError } from "./errors";
import { buildMessagesOf, namedFindings } from "./findings";
import { addToolsModel } from "../serve/mcp/tools-model";
import { generateBundle } from "./generate";

/** The bundle's folder inside the build output: gen/okf. */
const BUNDLE_FOLDER = "okf";

/** The bundle's folder inside the deployed Node.js app (ADR-0007). */
const DEPLOYED_BUNDLE_FOLDER = "okf-bundle";

/** One resolved task of the running cds build, with absolute src and dest. */
interface BuildTask {
  for: string;
  src: string;
  dest: string;
}

/** The parts of CAP's build plugin base class (cds.build.Plugin) this task uses. */
interface BuildPlugin {
  readonly task: BuildTask & { options: { model?: string[] } };
  readonly context: { tasks: BuildTask[] };
  init(): void;
  options(): Record<string, unknown>;
  baseModel(): Promise<unknown>;
  write(data: string | Buffer): { to(file: string): Promise<void> };
  pushMessage(message: string, severity: string): void;
}

/** CAP's build API, cds.build, which exists only while `cds build` runs. */
interface BuildApi {
  register?(id: string, plugin: unknown): void;
  Plugin: (new () => BuildPlugin) & { WARNING: string };
  BuildError: new (message: string, messages: string[]) => Error;
}

/** Registers the "okf" build task, when the running cds command is `cds build`. */
export function registerBuildTask(cds: Cds): void {
  // cds.build is undefined outside `cds build`, e.g. in `cds watch` or a deployed app.
  const build = (cds as unknown as { build?: BuildApi }).build;
  if (build?.register === undefined) return;
  build.register("okf", okfBuildPlugin(cds, build));
}

function okfBuildPlugin(cds: Cds, build: BuildApi) {
  return class OkfBuildPlugin extends build.Plugin {
    // The project root: the task loads the same model paths CAP gives every build task.
    static taskDefaults = { src: "." };

    // cds build rebuilds cds.env before it asks hasTask() (no task list) or constructs the
    // listed plugins, so OkfService's model is added again here (ADR-0005 (e)).
    static hasTask(): boolean {
      addToolsModel(cds);
      // The okf task always runs: the bundle is always built (ADR-0002).
      return true;
    }

    constructor() {
      super();
      addToolsModel(cds);
    }

    override init(): void {
      this.task.dest = bundleFolder(cds);
      this.task.options.model = withoutProjectRoot(cds, this.task.options.model);
    }

    // The model with doc comments: they become the concepts' descriptions (ADR-0007).
    override options(): Record<string, unknown> {
      return { ...super.options(), docs: true };
    }

    async build(): Promise<void> {
      // Toggled features aren't part of every tenant's app, so the bundle leaves them out.
      const model = await this.baseModel();
      // CAP has already logged that the app has no CDS model.
      if (model === undefined || model === null) return;
      const bundle = await mergedBundle(cds, build, model as Csn);
      await writeFiles(this, bundle.files, this.task.dest);
      this.reportFindings(bundle);
      const deployedApp = deployedNodejsApp(cds, this.context.tasks);
      if (deployedApp !== undefined) {
        await writeFiles(this, bundle.files, path.join(deployedApp, DEPLOYED_BUNDLE_FOLDER));
      }
    }

    // Warnings are logged after the build; errors fail it, listed one per message.
    // Each message names the file to open: okf/<path> for curated files, else gen/okf/<path>.
    private reportFindings(bundle: MergedBundle): void {
      const bundleFolder = path.relative(cds.root, this.task.dest).split(path.sep).join("/");
      // The knowledge lint (ADR-0012) adds warnings only; the validator already reports W1 and W4.
      const checks = [...validateBundle(bundle.files), ...lintKnowledge(bundle.files)];
      const findings = namedFindings(bundle, checks, bundleFolder);
      const { errors, warnings } = buildMessagesOf(findings);
      for (const warning of warnings) this.pushMessage(warning, build.Plugin.WARNING);
      if (errors.length > 0) {
        throw new build.BuildError(
          `[okf] ${bundleFolder} — the bundle has ${errors.length} error(s).\n` +
            "  Fix the problems listed; the bundle stays there for review, but isn't deployed.",
          errors,
        );
      }
    }
  };
}

// Writes the bundle into `folder` through CAP's plugin.write, which records each file for the
// build's output list. The folder is cap-okf's alone, so it is emptied first.
async function writeFiles(plugin: BuildPlugin, files: MergedFile[], folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
  for (const file of files) {
    // Curated files that aren't Markdown are copied byte for byte.
    const content = file.bytes === undefined ? file.text : Buffer.from(file.bytes);
    await plugin.write(content).to(path.join(folder, ...file.path.split("/")));
  }
}

// Only a staging build is deployed as built; an in-place build has no deployed app folder.
// The list of tasks is complete only inside build() (ADR-0007).
function deployedNodejsApp(cds: Cds, tasks: BuildTask[]): string | undefined {
  const target = (cds.env as unknown as { build?: { target?: string } }).build?.target;
  if (target === ".") return undefined;
  return tasks.find((task) => task.for === "nodejs")?.dest;
}

/** <root>/<build target>/okf; for in-place builds (target "."), <root>/gen/okf, as CAP's base. */
function bundleFolder(cds: Cds): string {
  const target = (cds.env as unknown as { build?: { target?: string } }).build?.target ?? "gen";
  const output = target === "." ? "gen" : target;
  return path.resolve(cds.root, output, BUNDLE_FOLDER);
}

// CAP adds the task's src (".") to its model paths, and loading the project root would pull in
// .cds files the app itself never loads.
function withoutProjectRoot(cds: Cds, model: string[] | undefined): string[] | undefined {
  return model?.filter((each) => path.resolve(cds.root, each) !== path.resolve(cds.root));
}

// A setup mistake becomes a BuildError: CAP's CLI prints its message plainly, and any other
// error with brackets around it.
async function mergedBundle(cds: Cds, build: BuildApi, model: Csn): Promise<MergedBundle> {
  try {
    return await generateBundle(cds, model);
  } catch (error) {
    // Mistakes the developer fixes in the app (config or model) print plainly.
    if (error instanceof SetupError || error instanceof ModelClashError) {
      throw new build.BuildError(error.message, []);
    }
    throw error;
  }
}
