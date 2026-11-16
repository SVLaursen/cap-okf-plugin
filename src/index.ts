import type cds from "@sap/cds";

/** The `cds` facade of the host app, handed in by cds-plugin.js (never read from a global). */
export type Cds = typeof cds;

/**
 * Activates cap-okf for the host app. CAP loads cds-plugin.js, which calls this once.
 * It registers nothing yet; the compile target, build task and serving come in later tasks
 * (ADR-0005).
 */
export function plugin(_cds: Cds): void {
  // Intentionally empty until task 2.8 registers the first extension point.
}
