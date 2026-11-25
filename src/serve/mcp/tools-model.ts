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
import { SetupError } from "../../build/errors";
import { COMMUNITY_CAP_MCP, installedPlugins, selectMcp } from "./select";
import { directiveDefinitions, directiveFor, directivesInModel, withDirective } from "./tool-texts";

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
 * cds.okf.serve.mcp counts as off here, so it never breaks cds build or cds compile; the server
 * reports it once selectMcp runs at bootstrap (task 4.5, step 2). Any other error is a bug and
 * is thrown.
 */
export function wantsToolsModel(cds: Cds): boolean {
  try {
    const selection = selectMcp({
      okf: (cds.env as unknown as { okf?: unknown }).okf,
      installed: installedPlugins(cds.env),
      packageName: packageNameOf(cds.root),
    });
    return selection.choice?.as.includes("tools") ?? false;
  } catch (error) {
    if (error instanceof SetupError) return false;
    throw error;
  }
}

/** Adds OkfService's model to cds.requires when the tools channel is on. */
export function addToolsModel(cds: Cds): void {
  if (!wantsToolsModel(cds)) return;
  const requires = (cds.env as unknown as { requires: Record<string, unknown> }).requires;
  requires[TOOLS_MODEL_KEY] = { model: toolsModelPath() };
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

/**
 * Sets OkfService's @requires from cds.okf.serve.mcp.requires (ADR-0010), so CAP enforces it on
 * every call and the MCP plugin hides tools a caller can't use, and @protocol: 'none' under
 * @gavdi/cap-mcp, where @mcp is no protocol and OkfService would otherwise also be on OData
 * (ADR-0006). Adds the directive parts to the tool descriptions when they can't be added per
 * caller (tool-texts.ts, ADR-0013). Runs on every model cds.load loads, so cds build bakes in the build's settings and
 * a server applies its own when it loads the built model.
 */
export function annotateToolsModel(cds: Cds): void {
  cds.on("loaded", (csn: unknown) => {
    const definitions = (csn as { definitions?: Record<string, Record<string, unknown>> })
      .definitions;
    const service = definitions?.["OkfService"];
    if (service === undefined) return;
    let choice;
    try {
      choice = selectMcp({
        okf: (cds.env as unknown as { okf?: unknown }).okf,
        installed: installedPlugins(cds.env),
        packageName: packageNameOf(cds.root),
      }).choice;
    } catch (error) {
      // A setup mistake stops the server at bootstrap (serving.ts).
      if (error instanceof SetupError) return;
      throw error;
    }
    // A model built with the tools channel on, served with it off: no handlers will come, so
    // the MCP plugin mustn't offer its tools.
    if (choice === undefined || !choice.as.includes("tools")) {
      service["@mcp"] = false;
      return;
    }
    service["@requires"] = choice.requires;
    if (choice.plugin === COMMUNITY_CAP_MCP) service["@protocol"] = "none";
    if (directivesInModel(choice)) addDirectives(definitions!);
    else removeDirectives(definitions!);
  });
}

// A model built with the directive parts in it (e.g. cds build with signals "always") and served
// with signals "auto": they come per caller as notes, so the model's copy goes.
function removeDirectives(definitions: Record<string, Record<string, unknown>>): void {
  for (const name of directiveDefinitions()) {
    const definition = definitions[name];
    const description = definition?.["@description"];
    const suffix = ` ${directiveFor(name) ?? ""}`;
    if (typeof description === "string" && description.endsWith(suffix)) {
      definition!["@description"] = description.slice(0, -suffix.length);
    }
  }
}

// Once per model: a description that already ends with its directive part isn't changed again.
function addDirectives(definitions: Record<string, Record<string, unknown>>): void {
  for (const name of directiveDefinitions()) {
    const definition = definitions[name];
    const neutral = definition?.["@description"];
    const directive = directiveFor(name);
    if (definition === undefined || typeof neutral !== "string" || directive === undefined) {
      continue;
    }
    if (!neutral.endsWith(directive)) definition["@description"] = withDirective(neutral, name);
  }
}
