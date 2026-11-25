// The MCP selector (task 4.4, ADR-0004, ADR-0006, ADR-0010): reads cds.okf.serve.mcp and decides
// which MCP plugin serves the bundle, on which channels, under which namespace and roles. Pure:
// the settings, the installed plugins and the app's package name in; a choice and warnings out;
// setup mistakes throw an [okf] error.
//
// - Opt-in (ADR-0004 §1): off unless cds.okf.serve.mcp is true or an object. Finding an MCP
//   plugin never turns anything on; it only decides how to serve.
// - Detection (ADR-0006): by package name in CAP's plugin list, no version check.
// - true means { plugin: "auto" } on the plugin's default channels: resources and tools for
//   @gavdi/cap-mcp (ADR-0012), tools for @cap-js/mcp.
// - namespace (ADR-0010): from cds.okf.serve.mcp.namespace, else the package name, lower case,
//   leading @ dropped, / → - (@acme/orders → acme-orders); must match the ADR's pattern.
// - requires (ADR-0010): the roles a caller needs, default authenticated-user.
// - related (ADR-0012): the "Read together with" line in a concept that is read; default true.
// - instructions (ADR-0013, Contract C): server instructions through @gavdi/cap-mcp's mcp:hints;
//   default true. It may also be the text to use.
// - pointers (ADR-0013): tool notes through mcp:hints; default false (they cost tokens on every
//   request). "short" gives titles and paths only, true adds descriptions.
// - signals (ADR-0013): "auto" (default) gives instructions, tool notes and the directive parts
//   of OkfService's tool descriptions only to callers who see curated notes; "always" gives them
//   to every caller.
import { setupError } from "../../build/errors";

export const COMMUNITY_CAP_MCP = "@gavdi/cap-mcp";
export const CAP_JS_MCP = "@cap-js/mcp";

/** The MCP plugins cap-okf can serve through. */
export type McpPlugin = typeof COMMUNITY_CAP_MCP | typeof CAP_JS_MCP;

/** What an MCP client gets: okf:// resources, or tools over OkfService. */
export type McpChannel = "resources" | "tools";

const PLUGINS: readonly McpPlugin[] = [COMMUNITY_CAP_MCP, CAP_JS_MCP];
const CHANNELS: readonly McpChannel[] = ["resources", "tools"];
const DEFAULT_CHANNELS: Record<McpPlugin, readonly McpChannel[]> = {
  [COMMUNITY_CAP_MCP]: ["resources", "tools"],
  [CAP_JS_MCP]: ["tools"],
};
const DEFAULT_REQUIRES: readonly string[] = ["authenticated-user"];
const NAMESPACE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** How cap-okf serves over MCP. */
export interface McpChoice {
  plugin: McpPlugin;
  as: McpChannel[];
  namespace: string;
  /** Roles a caller needs; one of them is enough, as with CAP's @requires. */
  requires: string[];
  /** Whether a concept that is read gets its "Read together with" line. */
  related: boolean;
  /** Server instructions: the default text (true), none (false), or the app's own text. */
  instructions: boolean | string;
  /** Tool notes pointing a tool to the curated notes about it: none, titles only, or full. */
  pointers: Pointers;
  /** Whether the signals to read depend on the caller seeing curated notes ("auto"). */
  signals: Signals;
}

/** cds.okf.serve.mcp.pointers: no tool notes, titles and paths only, or with descriptions. */
export type Pointers = false | "short" | true;

/** cds.okf.serve.mcp.signals. */
export type Signals = "auto" | "always";

export interface McpSelection {
  /** Undefined when nothing is served over MCP. */
  choice?: McpChoice;
  /** [okf] messages to log once. */
  warnings: string[];
}

export interface SelectorInput {
  /** cds.env.okf. */
  okf: unknown;
  /** The packages in CAP's resolved plugin list (cds.env.plugins). */
  installed: readonly string[];
  /** The app's package.json name, for the default namespace. */
  packageName: string | undefined;
}

/** The plugin, channels, namespace and roles to serve with, or none (see the module comment). */
export function selectMcp(input: SelectorInput): McpSelection {
  const settings = objectForm((input.okf as { serve?: { mcp?: unknown } } | undefined)?.serve?.mcp);
  if (settings === undefined) return { warnings: [] };
  const plugin = pluginFor(settings["plugin"], input.installed);
  if (plugin === undefined) return { warnings: [noPluginWarning()] };
  const warnings: string[] = [];
  const as = channelsFor(settings["as"], plugin, warnings);
  const namespace = namespaceFor(settings["namespace"], input.packageName);
  const choice: McpChoice = {
    plugin,
    as,
    namespace,
    requires: rolesFor(settings["requires"]),
    related: switchFor("related", settings["related"]),
    instructions: instructionsFor(settings["instructions"]),
    pointers: pointersFor(settings["pointers"]),
    signals: signalsFor(settings["signals"]),
  };
  return { choice, warnings };
}

// false, undefined or null (a profile resetting it) → off; true → {}; an object as it is.
function objectForm(setting: unknown): Record<string, unknown> | undefined {
  if (setting === undefined || setting === null || setting === false) return undefined;
  if (setting === true) return {};
  if (typeof setting === "object" && setting !== null && !Array.isArray(setting)) {
    return setting as Record<string, unknown>;
  }
  throw setupError(
    `[okf] cds.okf.serve.mcp — ${JSON.stringify(setting)} is not a known value.\n` +
      '  Use false (no MCP), true, or an object such as { "plugin": "auto", "as": ["tools"] }.',
  );
}

function pluginFor(setting: unknown, installed: readonly string[]): McpPlugin | undefined {
  const found = PLUGINS.filter((plugin) => installed.includes(plugin));
  const wanted = setting ?? "auto";
  if (wanted === "auto") {
    if (found.length > 1) throw bothInstalled();
    return found[0];
  }
  if (!PLUGINS.includes(wanted as McpPlugin)) {
    throw setupError(
      `[okf] cds.okf.serve.mcp.plugin — ${JSON.stringify(wanted)} is not a known MCP plugin.\n` +
        `  Use "auto", "${COMMUNITY_CAP_MCP}" or "${CAP_JS_MCP}".`,
    );
  }
  if (!found.includes(wanted as McpPlugin)) {
    throw setupError(
      `[okf] cds.okf.serve.mcp.plugin — ${String(wanted)} is set, but not installed.\n` +
        `  Add ${String(wanted)} to the app's dependencies, or set another plugin.`,
    );
  }
  return wanted as McpPlugin;
}

function bothInstalled(): Error {
  return setupError(
    `[okf] cds.okf.serve.mcp — both ${COMMUNITY_CAP_MCP} and ${CAP_JS_MCP} are installed, so ` +
      '"auto" can\'t choose.\n' +
      `  Set cds.okf.serve.mcp.plugin to "${COMMUNITY_CAP_MCP}" or "${CAP_JS_MCP}".`,
  );
}

function noPluginWarning(): string {
  return (
    "[okf] cds.okf.serve.mcp — is on, but no MCP plugin is installed, so nothing is served over MCP.\n" +
    `  Add ${COMMUNITY_CAP_MCP} or ${CAP_JS_MCP} to the app's dependencies, or turn MCP off.`
  );
}

// Unknown channels are left out with a warning; with none left, the plugin's default channels.
function channelsFor(setting: unknown, plugin: McpPlugin, warnings: string[]): McpChannel[] {
  if (setting === undefined) return [...DEFAULT_CHANNELS[plugin]];
  const wanted = Array.isArray(setting) ? setting : [setting];
  const channels: McpChannel[] = [];
  for (const value of wanted) {
    if (CHANNELS.includes(value as McpChannel)) {
      if (!channels.includes(value as McpChannel)) channels.push(value as McpChannel);
    } else {
      warnings.push(
        `[okf] cds.okf.serve.mcp.as — ${JSON.stringify(value)} is not a channel, so it is left out.\n` +
          '  Use "resources" or "tools".',
      );
    }
  }
  return channels.length > 0 ? channels : [...DEFAULT_CHANNELS[plugin]];
}

// Set: it must be valid text. Not set (or null, so a profile can reset it): derived from the
// package name, and an invalid result says where it came from.
function namespaceFor(setting: unknown, packageName: string | undefined): string {
  if (setting !== undefined && setting !== null) return checkedNamespace(setting);
  const derived = derivedNamespace(packageName);
  if (derived === undefined) {
    throw setupError(
      "[okf] cds.okf.serve.mcp.namespace — is missing, and the app's package.json has no name to derive it from.\n" +
        '  Set cds.okf.serve.mcp.namespace, e.g. "acme-orders".',
    );
  }
  if (!NAMESPACE.test(derived)) {
    const suggestion = derived.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "my-app";
    throw setupError(
      `[okf] cds.okf.serve.mcp.namespace — "${derived}", derived from the package.json name "${String(packageName)}", isn't a valid namespace.\n` +
        `  Set cds.okf.serve.mcp.namespace, e.g. "${suggestion}".`,
    );
  }
  return derived;
}

function checkedNamespace(setting: unknown): string {
  if (typeof setting !== "string" || !NAMESPACE.test(setting)) {
    throw setupError(
      `[okf] cds.okf.serve.mcp.namespace — ${JSON.stringify(setting)} isn't a valid namespace.\n` +
        "  Use lower-case letters, digits and -, starting and ending with a letter or digit.",
    );
  }
  return setting;
}

// "@acme/orders" → "acme-orders" (ADR-0010).
function derivedNamespace(packageName: string | undefined): string | undefined {
  if (packageName === undefined || packageName.trim() === "") return undefined;
  return packageName.trim().toLowerCase().replace(/^@/, "").replace(/\//g, "-");
}

function rolesFor(setting: unknown): string[] {
  // A copy, so a caller that changes its choice can't change the default for later calls.
  if (setting === undefined) return [...DEFAULT_REQUIRES];
  const roles = Array.isArray(setting) ? setting : [setting];
  if (
    roles.length === 0 ||
    !roles.every((role) => typeof role === "string" && role.trim() !== "")
  ) {
    throw setupError(
      `[okf] cds.okf.serve.mcp.requires — ${JSON.stringify(setting)} isn't a role or a list of roles.\n` +
        '  Use a role such as "authenticated-user", or a list such as ["admin", "support"].',
    );
  }
  return roles as string[];
}

// true or false; not set (or null, so a profile can reset it) is true.
function switchFor(key: string, setting: unknown): boolean {
  if (setting === undefined || setting === null) return true;
  if (typeof setting === "boolean") return setting;
  throw setupError(
    `[okf] cds.okf.serve.mcp.${key} — ${JSON.stringify(setting)} isn't true or false.\n` +
      "  Use true (the default) or false.",
  );
}

// true, false or the app's own text; not set (or null) is true.
function instructionsFor(setting: unknown): boolean | string {
  if (setting === undefined || setting === null) return true;
  if (typeof setting === "boolean") return setting;
  if (typeof setting === "string" && setting.trim() !== "") return setting.trim();
  throw setupError(
    `[okf] cds.okf.serve.mcp.instructions — ${JSON.stringify(setting)} isn't true, false or a text.\n` +
      "  Use true (the default text), false (none) or the instructions to give, as a string.",
  );
}

// false, "short" or true; not set (or null) is false: tool notes cost tokens on every request,
// and the server instructions are the cheap signal (ADR-0013).
function pointersFor(setting: unknown): Pointers {
  if (setting === undefined || setting === null) return false;
  if (typeof setting === "boolean" || setting === "short") return setting;
  throw setupError(
    `[okf] cds.okf.serve.mcp.pointers — ${JSON.stringify(setting)} isn't false, "short" or true.\n` +
      '  Use false (the default, no tool notes), "short" (titles and paths) or true (with descriptions).',
  );
}

// "auto" or "always"; not set (or null) is "auto".
function signalsFor(setting: unknown): Signals {
  if (setting === undefined || setting === null) return "auto";
  if (setting === "auto" || setting === "always") return setting;
  throw setupError(
    `[okf] cds.okf.serve.mcp.signals — ${JSON.stringify(setting)} isn't "auto" or "always".\n` +
      '  Use "auto" (the default: only for callers who see curated notes) or "always".',
  );
}

/** The package names in CAP's resolved plugin list, cds.env.plugins (ADR-0006: by name only). */
export function installedPlugins(env: unknown): string[] {
  const plugins = (env as { plugins?: unknown } | undefined)?.plugins;
  return typeof plugins === "object" && plugins !== null ? Object.keys(plugins) : [];
}
