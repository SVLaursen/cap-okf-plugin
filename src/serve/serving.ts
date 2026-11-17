// Serving the bundle (tasks 4.3, 4.5; ADR-0002, ADR-0007): at bootstrap, reads which channels
// are on and gives them one set of bundles per server, built before served completes.
// - The static route (cds.okf.serve.static, task 4.3).
// - The MCP tools channel (cds.okf.serve.mcp, task 4.5): the selector (task 4.4) runs here, so a
//   setup mistake stops the server, never cds build; its warnings are logged once.
// - The MCP resources channel through @gavdi/cap-mcp (task 4.6): subscribed at plugin load, told
//   at bootstrap what to serve.
// Nothing is built or served when every channel is off.
import type { Application } from "express";
import type { Cds } from "../index";
import { oneBundleForEveryKey } from "./bundles";
import { gavdiResources } from "./mcp/gavdi-cap-mcp";
import { attachOkfService } from "./mcp/okf-service";
import { GAVDI_CAP_MCP, installedPlugins, selectMcp, type McpChoice } from "./mcp/select";
import { packageNameOf } from "./mcp/tools-model";
import { startupBundleSource } from "./source";
import { staticRouteOf } from "./static-config";
import { mountStaticRoute } from "./static-route";

/** Registers the serving channels for the app; they start at bootstrap. */
export function registerServing(cds: Cds): void {
  const log = cds.log("okf");
  const warn = (message: string) => log.warn(message);
  // At plugin load: @gavdi/cap-mcp emits mcp:resources from its own served listener (ADR-0010).
  const resources = gavdiResources(cds, warn);

  cds.on("bootstrap", (app: Application) => {
    const okf = (cds.env as unknown as { okf?: unknown }).okf;
    const route = staticRouteOf(okf);
    const { tools, viaGavdi } = mcpChannels(mcpChoice(cds, okf, warn));
    // Every server says what it serves, so a previous server's resources are never reused.
    resources.use(undefined);
    if (route === undefined && tools === undefined && viaGavdi === undefined) return;

    // One set of bundles per server: a process may boot more than one app.
    const bundles = oneBundleForEveryKey(() => startupBundleSource(cds, log, process.env));
    // Built before served completes (ADR-0007). A setup error, such as okf being a file, stops
    // startup; curated files with errors don't (see source.ts). CAP waits for a promise a
    // served listener returns (@sap/cds lib/index.js), though its types say it returns nothing.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cds.on("served", () => bundles.forKey({}).then(() => undefined));
    if (route !== undefined) mountStaticRoute(app, cds, route, bundles);
    if (tools !== undefined) cds.on("served", () => attachOkfService(cds, bundles, tools));
    if (viaGavdi !== undefined) resources.use({ choice: viaGavdi, bundles });
  });
}

/** The choice per MCP channel: tools (OkfService), and resources through @gavdi/cap-mcp. */
export function mcpChannels(mcp: McpChoice | undefined): {
  tools?: McpChoice;
  viaGavdi?: McpChoice;
} {
  if (mcp === undefined) return {};
  const viaGavdi = mcp.plugin === GAVDI_CAP_MCP && mcp.as.includes("resources");
  return {
    ...(mcp.as.includes("tools") && { tools: mcp }),
    ...(viaGavdi && { viaGavdi: mcp }),
  };
}

// How to serve over MCP, if at all; selector warnings go to `warn`.
function mcpChoice(cds: Cds, okf: unknown, warn: (message: string) => void): McpChoice | undefined {
  const selection = selectMcp({
    okf,
    installed: installedPlugins(cds.env),
    packageName: packageNameOf(cds.root),
  });
  for (const warning of selection.warnings) warn(warning);
  return selection.choice;
}
