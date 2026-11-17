// Serving the bundle (tasks 4.3, 4.5; ADR-0002, ADR-0007): at bootstrap, reads which channels
// are on and gives them one set of bundles per server, built before served completes.
// - The static route (cds.okf.serve.static, task 4.3).
// - The MCP tools channel (cds.okf.serve.mcp, task 4.5): the selector (task 4.4) runs here, so a
//   setup mistake stops the server, never cds build; its warnings are logged once.
// Nothing is built or served when every channel is off.
import type { Application } from "express";
import type { Cds } from "../index";
import { oneBundleForEveryKey } from "./bundles";
import { attachOkfService } from "./mcp/okf-service";
import { installedPlugins, selectMcp, type McpChoice } from "./mcp/select";
import { packageNameOf } from "./mcp/tools-model";
import { startupBundleSource } from "./source";
import { staticRouteOf } from "./static-config";
import { mountStaticRoute } from "./static-route";

/** Registers the serving channels for the app; they start at bootstrap. */
export function registerServing(cds: Cds): void {
  const log = cds.log("okf");

  cds.on("bootstrap", (app: Application) => {
    const okf = (cds.env as unknown as { okf?: unknown }).okf;
    const route = staticRouteOf(okf);
    const tools = toolsChoice(cds, okf, (message) => log.warn(message));
    if (route === undefined && tools === undefined) return;

    // One set of bundles per server: a process may boot more than one app.
    const bundles = oneBundleForEveryKey(() => startupBundleSource(cds, log, process.env));
    // Built before served completes (ADR-0007). A setup error, such as okf being a file, stops
    // startup; curated files with errors don't (see source.ts). CAP waits for a promise a
    // served listener returns (@sap/cds lib/index.js), though its types say it returns nothing.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cds.on("served", () => bundles.forKey({}).then(() => undefined));
    if (route !== undefined) mountStaticRoute(app, cds, route, bundles);
    if (tools !== undefined) cds.on("served", () => attachOkfService(cds, bundles, tools));
  });
}

// The MCP choice when it includes the tools channel; selector warnings go to `warn`.
function toolsChoice(
  cds: Cds,
  okf: unknown,
  warn: (message: string) => void,
): McpChoice | undefined {
  const selection = selectMcp({
    okf,
    installed: installedPlugins(cds.env),
    packageName: packageNameOf(cds.root),
  });
  for (const warning of selection.warnings) warn(warning);
  return selection.choice?.as.includes("tools") === true ? selection.choice : undefined;
}
