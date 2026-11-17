// Adds OkfService's model to the app only when the MCP tools channel is on (task 4.5, ADR-0005
// (e), option 4): a cds.requires entry with only a model adds that model to cds.resolve('*'), and
// its key isn't a service name, so nothing is mocked. addToolsModel is called from three places
// so every command sees it:
// - at plugin load: cds serve, cds watch, cds.test and cds compile '*';
// - in the okf build task's static hasTask(): cds build without a task list;
// - in the okf build task's constructor: cds build with a task list that includes okf.
// A task list without okf misses the model (ADR-0005 (b)); a warning at served says so.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Cds } from "../../index";
import { installedPlugins, selectMcp } from "./select";

/** The cds.requires key the model is added under. */
export const TOOLS_MODEL_KEY = "cap-okf/tools";

/** Where OkfService's model is: <cap-okf>/srv/okf-service.cds. */
export function toolsModelPath(): string {
  // This file is src/serve/mcp/tools-model.ts or, built, lib/serve/mcp/tools-model.js.
  return path.join(__dirname, "..", "..", "..", "srv", "okf-service.cds");
}

/**
 * Whether the tools channel is on, with the same rules as the MCP selector (task 4.4): true
 * picks the installed plugin's natural channel, so "on" alone isn't enough. A setup mistake in
 * cds.okf.serve.mcp counts as off here; the server reports it when it starts.
 */
export function wantsToolsModel(cds: Cds): boolean {
  try {
    const selection = selectMcp({
      okf: (cds.env as unknown as { okf?: unknown }).okf,
      installed: installedPlugins(cds.env),
      packageName: packageNameOf(cds.root),
    });
    return selection.choice?.as.includes("tools") ?? false;
  } catch {
    return false;
  }
}

/**
 * Adds OkfService's model to cds.requires when the tools channel is on. Always returns true, so
 * the okf build task's hasTask() can return it: the task always runs (ADR-0002).
 */
export function addToolsModel(cds: Cds): true {
  if (wantsToolsModel(cds)) {
    const requires = (cds.env as unknown as { requires: Record<string, unknown> }).requires;
    requires[TOOLS_MODEL_KEY] = { model: toolsModelPath() };
  }
  return true;
}

/** Warns once at served when the tools channel is on but OkfService isn't in the model. */
export function warnWithoutToolsModel(cds: Cds): void {
  cds.on("served", () => {
    const definitions = (cds.model as unknown as { definitions?: Record<string, unknown> })
      ?.definitions;
    if (!wantsToolsModel(cds) || definitions?.["OkfService"] !== undefined) return;
    cds
      .log("okf")
      .warn(
        "[okf] OkfService — the MCP tools channel is on, but OkfService isn't in the app's model.\n" +
          '  If the app lists its own cds.build.tasks, add { "for": "okf" } to them and build again.',
      );
  });
}

/** The name in <root>/package.json, the default for the MCP namespace (ADR-0010). */
export function packageNameOf(root: string): string | undefined {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return undefined;
  try {
    const name = (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}
