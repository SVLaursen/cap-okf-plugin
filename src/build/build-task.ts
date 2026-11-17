// The `okf` build task for `cds build` (task 2.9, ADR-0005 (b), ADR-0007).
// - It writes the bundle to <build target>/okf (gen/okf), for review and CI, whatever src or dest
//   a task list or --dest gives: those are for deployable modules, and could point into the
//   curated okf/ folder. Both of its folders are emptied first, so no file from an earlier build
//   survives, also with --clean false or a deployed app outside gen/.
// - It documents the model the deployed app has: the build's default model paths, without the
//   project root itself (which would pull in loose .cds files) and without feature toggles.
// - In staging builds it puts the same files into the Node.js app that is deployed,
//   <nodejs dest>/okf-bundle/ (gen/srv/okf-bundle/), where the server finds them in production.
// - It validates the bundle: warnings are reported, errors fail the build before the bundle is
//   put into the deployed app.
// - In-place builds (build.target: ".") write <root>/gen/okf only; the curated okf/ folder is
//   never touched.
import { rm } from "node:fs/promises";
import path from "node:path";
import { serializeConcept } from "../core/concept";
import { validateBundle, type BundleFile } from "../core/validate";
import type { Csn } from "../export/csn";
import type { Cds } from "../index";
import { SetupError } from "./errors";
import { buildMessagesOf } from "./findings";
import { generateConcepts } from "./generate";

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
  write(data: string): { to(file: string): Promise<void> };
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
      const files = bundleFiles(cds, build, model as Csn);
      await this.writeFiles(files, this.task.dest);
      this.reportFindings(files);
      const deployedApp = this.deployedNodejsApp();
      if (deployedApp !== undefined) {
        await this.writeFiles(files, path.join(deployedApp, DEPLOYED_BUNDLE_FOLDER));
      }
    }

    // The folder is cap-okf's alone, so it is emptied first.
    private async writeFiles(files: BundleFile[], folder: string): Promise<void> {
      await rm(folder, { recursive: true, force: true });
      for (const file of files) {
        await this.write(file.text).to(path.join(folder, ...file.path.split("/")));
      }
    }

    // Warnings are logged after the build; errors fail it, listed one per message.
    private reportFindings(files: BundleFile[]): void {
      const { errors, warnings } = buildMessagesOf(validateBundle(files));
      for (const warning of warnings) this.pushMessage(warning, build.Plugin.WARNING);
      if (errors.length > 0) {
        throw new build.BuildError(
          `[okf] ${path.relative(cds.root, this.task.dest)} — the bundle breaks OKF v0.2 in ${errors.length} place(s).\n` +
            "  Fix the problems listed; the bundle stays there for review, but isn't deployed.",
          errors,
        );
      }
    }

    // Only a staging build is deployed as built; an in-place build has no deployed app folder.
    // The list of tasks is complete only inside build() (ADR-0007).
    private deployedNodejsApp(): string | undefined {
      const target = (cds.env as unknown as { build?: { target?: string } }).build?.target;
      if (target === ".") return undefined;
      return this.context.tasks.find((task) => task.for === "nodejs")?.dest;
    }
  };
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
function bundleFiles(cds: Cds, build: BuildApi, model: Csn): BundleFile[] {
  try {
    return generateConcepts(cds, model).map((concept) => ({
      path: concept.path,
      text: serializeConcept(concept),
    }));
  } catch (error) {
    if (error instanceof SetupError) throw new build.BuildError(error.message, []);
    throw error;
  }
}
