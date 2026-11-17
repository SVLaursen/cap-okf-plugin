// Checks the settings under cds.okf (task 4.10). Pure: the cds.okf block and the command in,
// [okf] warnings out.
// - Always: keys cap-okf doesn't know (e.g. a typo such as "requries"), and blocks that aren't
//   objects. cap-okf would silently ignore both.
// - During cds build and cds compile: the serve settings, which those commands never read, so a
//   mistake there would otherwise first show when the deployed app stops at startup. The messages
//   are the ones startup stops with (static-config.ts, mcp/select.ts).
// Values that are read are already checked where they are read: include by the build, serve.* by
// startup. Settings are never read from or written to cds.mcp (ADR-0004).
import { SetupError } from "../build/errors";
import { GAVDI_CAP_MCP, selectMcp, type McpPlugin, CAP_JS_MCP } from "../serve/mcp/select";
import { staticRouteOf } from "../serve/static-config";

/** The keys each block may have, in the order the fix line names them. */
const KEYS = {
  "cds.okf": ["include", "projectionSources", "serve"],
  "cds.okf.serve": ["static", "mcp"],
  "cds.okf.serve.mcp": [
    "plugin",
    "as",
    "namespace",
    "requires",
    "related",
    "instructions",
    "pointers",
  ],
};

const EXAMPLES = {
  "cds.okf": '{ "include": "services" }',
  "cds.okf.serve": '{ "static": true }',
};

// The commands that build the bundle without starting a server.
const BUILD_COMMANDS = ["build", "compile"];

export interface CheckContext {
  /** cds.cli.command: "build", "compile", "serve", … or undefined (e.g. in cds.test). */
  command: string | undefined;
  /** The app's package.json name, from which the MCP namespace is derived. */
  packageName: string | undefined;
}

/** Warnings about cds.okf (see the module comment); empty when everything is fine. */
export function configWarnings(okf: unknown, context: CheckContext): string[] {
  const warnings: string[] = [];
  const block = objectBlock("cds.okf", okf, warnings);
  if (block === undefined) return warnings;
  const serve = objectBlock("cds.okf.serve", block["serve"], warnings);
  const mcp = serve?.["mcp"];
  if (isObject(mcp)) unknownKeys("cds.okf.serve.mcp", mcp, warnings);
  if (serve !== undefined && BUILD_COMMANDS.includes(context.command ?? "")) {
    warnings.push(...serveWarnings(block, serve, context.packageName));
  }
  return warnings;
}

// The block as an object, after warning about its unknown keys; undefined when it isn't one.
function objectBlock(
  key: "cds.okf" | "cds.okf.serve",
  value: unknown,
  warnings: string[],
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) {
    warnings.push(
      `[okf] ${key} — ${JSON.stringify(value)} isn't an object, so it is ignored.\n` +
        `  Use an object such as ${EXAMPLES[key]}.`,
    );
    return undefined;
  }
  unknownKeys(key, value, warnings);
  return value;
}

function unknownKeys(key: keyof typeof KEYS, block: object, warnings: string[]): void {
  const known = KEYS[key];
  for (const name of Object.keys(block)) {
    if (known.includes(name)) continue;
    warnings.push(
      `[okf] ${key}.${name} — isn't a setting of cap-okf, so it is ignored.\n` +
        `  Use one of: ${known.join(", ")}.`,
    );
  }
}

// What startup would say about serve.static and serve.mcp, as warnings.
function serveWarnings(
  okf: Record<string, unknown>,
  serve: Record<string, unknown>,
  packageName: string | undefined,
): string[] {
  const warnings: string[] = [];
  collect(warnings, () => staticRouteOf(okf));
  collect(warnings, () => {
    const selection = selectMcp({ okf, installed: assumedInstalled(serve), packageName });
    warnings.push(...selection.warnings);
  });
  return warnings;
}

// Whether a plugin is installed is startup's business; here the settings are checked as if the
// plugin they name (or, for "auto", @gavdi/cap-mcp) were the one installed.
function assumedInstalled(serve: Record<string, unknown>): McpPlugin[] {
  const mcp = serve["mcp"];
  const plugin = isObject(mcp) ? mcp["plugin"] : undefined;
  return plugin === CAP_JS_MCP ? [CAP_JS_MCP] : [GAVDI_CAP_MCP];
}

// Runs a check; a setup error becomes a warning, anything else is a bug and is thrown.
function collect(warnings: string[], check: () => void): void {
  try {
    check();
  } catch (error) {
    if (!(error instanceof SetupError)) throw error;
    warnings.push(error.message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
