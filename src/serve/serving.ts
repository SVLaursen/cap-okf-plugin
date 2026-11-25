// Serving the bundle (tasks 4.3, 4.5; ADR-0002, ADR-0007): at bootstrap, reads which channels
// are on and gives them one set of bundles per server, built before served completes.
// - The static route (cds.okf.serve.static, task 4.3).
// - The MCP tools channel (cds.okf.serve.mcp, task 4.5): the selector (task 4.4) runs here, so a
//   setup mistake stops the server, never cds build; its warnings are logged once.
// - The MCP resources channel through @gavdi/cap-mcp (task 4.6): subscribed at plugin load, told
//   at bootstrap what to serve.
// - Instructions and tool notes through @gavdi/cap-mcp's mcp:hints (ADR-0013): the same way.
// Nothing is built or served when every channel is off.
import type { Application } from "express";
import type { Cds } from "../index";
import { oneBundleForEveryKey } from "./bundles";
import { communityResources } from "./mcp/community-cap-mcp";
import { MAX_PINNED, allPinnedNotes, communityHints } from "./mcp/community-hints";
import { attachOkfService } from "./mcp/okf-service";
import { COMMUNITY_CAP_MCP, installedPlugins, selectMcp, type McpChoice } from "./mcp/select";
import { packageNameOf } from "./mcp/tools-model";
import { startupBundleSource } from "./source";
import { staticRouteOf } from "./static-config";
import { mountStaticRoute } from "./static-route";
import type { Bundles } from "./bundles";
import { viewOf } from "./views";

/** Registers the serving channels for the app; they start at bootstrap. */
export function registerServing(cds: Cds): void {
  const log = cds.log("okf");
  const warn = (message: string) => log.warn(message);
  // At plugin load: @gavdi/cap-mcp emits mcp:resources from its own served listener (ADR-0010).
  const resources = communityResources(cds, warn);
  // The same for mcp:hints (ADR-0013, Contract C): instructions and tool notes.
  const hints = communityHints(cds, (message) => log.debug(message), warn);

  cds.on("bootstrap", (app: Application) => {
    const okf = (cds.env as unknown as { okf?: unknown }).okf;
    const route = staticRouteOf(okf);
    const mcp = mcpChoice(cds, okf, warn);
    const { tools, viaCommunity } = mcpChannels(mcp);
    // Every server says what it serves, so a previous server's resources are never reused.
    resources.use(undefined);
    hints.use(undefined);
    if (route === undefined && tools === undefined && viaCommunity === undefined) return;

    // One set of bundles per server: a process may boot more than one app.
    const bundles = oneBundleForEveryKey(() => startupBundleSource(cds, log, process.env));
    // Built before served completes (ADR-0007). A setup error, such as okf being a file, stops
    // startup; curated files with errors don't (see source.ts). CAP waits for a promise a
    // served listener returns (@sap/cds lib/index.js), though its types say it returns nothing.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cds.on("served", () => bundles.forKey({}).then(() => undefined));
    if (route !== undefined) mountStaticRoute(app, cds, route, bundles);
    if (tools !== undefined) cds.on("served", () => attachOkfService(cds, bundles, tools));
    if (viaCommunity !== undefined) resources.use({ choice: viaCommunity, bundles });
    // Hints only through @gavdi/cap-mcp, and only when serve.mcp is on (ADR-0013).
    if (mcp?.plugin === COMMUNITY_CAP_MCP) {
      hints.use({ choice: mcp, bundles });
      if (mcp.instructions !== false) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        cds.on("served", () => warnAboutPinned(bundles, warn));
      }
    }
  });
}

/** The instructions list at most three pinned notes; more than that is a warning, once. */
export async function warnAboutPinned(
  bundles: Bundles,
  warn: (message: string) => void,
): Promise<void> {
  const everyone = { isAuthenticated: true, is: () => true };
  const pinned = allPinnedNotes(await viewOf(await bundles.forKey({}), everyone));
  if (pinned.length <= MAX_PINNED) return;
  const listed = pinned.slice(0, MAX_PINNED).map((note) => note.path);
  warn(
    `[okf] okf/ — ${pinned.length} notes are pinned, so the server instructions list only the first ${MAX_PINNED}: ${listed.join(", ")}.\n` +
      `  Pin at most ${MAX_PINNED} notes: set pinned: true only where a note must reach every agent.`,
  );
}

/** The choice per MCP channel: tools (OkfService), and resources through @gavdi/cap-mcp. */
export function mcpChannels(mcp: McpChoice | undefined): {
  tools?: McpChoice;
  viaCommunity?: McpChoice;
} {
  if (mcp === undefined) return {};
  const viaCommunity = mcp.plugin === COMMUNITY_CAP_MCP && mcp.as.includes("resources");
  return {
    ...(mcp.as.includes("tools") && { tools: mcp }),
    ...(viaCommunity && { viaCommunity: mcp }),
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
