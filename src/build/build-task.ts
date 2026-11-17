// The `okf` build task for `cds build` (task 2.9, ADR-0005 (b), ADR-0007).
// - It writes the bundle to gen/okf, for review and CI. Before each build CAP deletes gen/ in
//   staging builds, and the base plugin's clean() deletes gen/okf in in-place builds, so no file
//   from an earlier build survives.
// - In staging builds it puts the same files into the Node.js app that is deployed,
//   <nodejs dest>/okf-bundle/ (gen/srv/okf-bundle/), where the server finds them in production.
// - It validates the bundle: warnings are reported, errors fail the build before the bundle is
//   put into the deployed app.
// - In-place builds (build.target: ".") write <root>/gen/okf only; the curated okf/ folder is
//   never touched.
import path from "node:path";
import { serializeConcept } from "../core/concept";
import { validateBundle, type BundleFile } from "../core/validate";
import type { Csn } from "../export/csn";
import type { Cds } from "../index";
import { isSetupError } from "./errors";
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
  readonly task: BuildTask;
  readonly context: { tasks: BuildTask[] };
  init(): void;
  options(): Record<string, unknown>;
  model(): Promise<unknown>;
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
      // The base init() adds gen/ for in-place builds, so the result is never <root>/okf.
      super.init();
      this.task.dest = path.join(this.task.dest, BUNDLE_FOLDER);
    }

    // The model with doc comments: they become the concepts' descriptions (ADR-0007).
    override options(): Record<string, unknown> {
      return { ...super.options(), docs: true };
    }

    async build(): Promise<void> {
      const model = await this.model();
      // CAP has already logged that the app has no CDS model.
      if (model === undefined || model === null) return;
      const files = bundleFiles(cds, build, model as Csn);
      await this.writeFiles(files, this.task.dest);
      this.failOnErrors(files);
      const deployedApp = this.deployedNodejsApp();
      if (deployedApp !== undefined) {
        await this.writeFiles(files, path.join(deployedApp, DEPLOYED_BUNDLE_FOLDER));
      }
    }

    private async writeFiles(files: BundleFile[], folder: string): Promise<void> {
      for (const file of files) {
        await this.write(file.text).to(path.join(folder, ...file.path.split("/")));
      }
    }

    // Warnings are logged after the build; errors fail it, listed one per message.
    private failOnErrors(files: BundleFile[]): void {
      const { errors, warnings } = buildMessagesOf(validateBundle(files));
      for (const warning of warnings) this.pushMessage(warning, build.Plugin.WARNING);
      if (errors.length > 0) {
        throw new build.BuildError(
          `[okf] ${this.task.dest} — the bundle breaks OKF v0.2 in ${errors.length} place(s).`,
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

// A setup mistake becomes a BuildError: CAP's CLI prints its message plainly, and any other
// error with brackets around it.
function bundleFiles(cds: Cds, build: BuildApi, model: Csn): BundleFile[] {
  try {
    return generateConcepts(cds, model).map((concept) => ({
      path: concept.path,
      text: serializeConcept(concept),
    }));
  } catch (error) {
    if (isSetupError(error)) throw new build.BuildError(error.message, []);
    throw error;
  }
}
