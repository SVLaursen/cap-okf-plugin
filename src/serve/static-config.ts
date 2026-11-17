// cds.okf.serve.static (task 4.3, ADR-0002): false (the default) serves nothing, true serves the
// bundle at /okf, a path serves it there. Pure: the cds.okf block in, the route or undefined out.
import { setupError } from "../build/errors";

const DEFAULT_ROUTE = "/okf";

// Segments of letters, digits, "-", "_" and ".", so the route needs no encoding.
const ROUTE = /^(\/[A-Za-z0-9._-]+)+$/;

/** The route to serve the bundle at, or undefined when the static route is off. */
export function staticRouteOf(okf: unknown): string | undefined {
  const serve = (okf as { serve?: { static?: unknown } } | undefined)?.serve;
  const setting = serve?.static;
  if (setting === undefined || setting === false) return undefined;
  if (setting === true) return DEFAULT_ROUTE;
  if (typeof setting !== "string") {
    throw setupError(
      `[okf] cds.okf.serve.static — ${JSON.stringify(setting)} is not a known value.\n` +
        '  Use false (serve nothing), true (serve at /okf) or a path such as "/knowledge".',
    );
  }
  return checkedRoute(setting);
}

function checkedRoute(setting: string): string {
  const route = setting.replace(/\/+$/, "");
  if (!setting.startsWith("/")) {
    throw setupError(
      `[okf] cds.okf.serve.static — "${setting}" must start with /.\n` +
        `  Write it as "/${setting}".`,
    );
  }
  if (route === "") {
    throw setupError(
      "[okf] cds.okf.serve.static — the route can't be /, which is the app itself.\n" +
        '  Use a path such as "/okf", or true for /okf.',
    );
  }
  if (!ROUTE.test(route)) {
    throw setupError(
      `[okf] cds.okf.serve.static — "${setting}" must be a path of letters, digits, "-", "_" and ".".\n` +
        '  Use a path such as "/okf" or "/docs/knowledge".',
    );
  }
  return route;
}
