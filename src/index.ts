import type cds from "@sap/cds";
import { registerBuildTask } from "./build/build-task";
import { registerCompileTarget } from "./build/compile";

/** The `cds` facade of the host app, handed in by cds-plugin.js (never read from a global). */
export type Cds = typeof cds;

/**
 * Activates cap-okf for the host app. CAP loads cds-plugin.js, which calls this once.
 * It registers the `cds compile --to okf` target (task 2.8) and the `okf` build task (task 2.9);
 * serving comes in later tasks (ADR-0005).
 */
export function plugin(cds: Cds): void {
  registerCompileTarget(cds);
  registerBuildTask(cds);
}
