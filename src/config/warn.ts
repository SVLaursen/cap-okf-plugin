// Logs the cds.okf warnings (task 4.10) once, when CAP loads the plugin: cds.env is complete by
// then, with profiles and environment variables applied.
import type { Cds } from "../index";
import { packageNameOf } from "../serve/mcp/tools-model";
import { configWarnings } from "./check";

export function warnAboutConfig(cds: Cds): void {
  const okf = (cds.env as unknown as { okf?: unknown }).okf;
  const command = (cds as unknown as { cli?: { command?: string } }).cli?.command;
  const warnings = configWarnings(okf, { command, packageName: packageNameOf(cds.root) });
  const log = cds.log("okf");
  for (const warning of warnings) log.warn(warning);
}
