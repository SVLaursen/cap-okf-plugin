// The MCP resources channel through @gavdi/cap-mcp (task 4.6, ADR-0010 Contract A). The plugin
// emits mcp:resources once, from its own served listener; listeners register synchronously.
// cap-okf registers:
// - okf://<namespace>/index.md, a fixed resource, visible only to callers who meet `requires`;
// - okf://<namespace>/{+path}, one template for every concept (read and complete, no list).
// Every answer goes through the ADR-0003 filter for the caller. An unknown path, a caller who
// doesn't meet `requires` and a malformed escape all throw the same 404, so they look alike.
//
// The plugin is never required (ADR-0004): it is met through its event, and the shapes below are
// declared here, so the published types never reference @gavdi/cap-mcp.
import { isBundlePath, sortPaths } from "../../bundle/paths";
import type { BundleSource } from "../../bundle/source";
import { setupError } from "../../build/errors";
import { forReader } from "../../core/filter";
import type { Bundles } from "../bundles";
import { servableText } from "../text";
import { isAuthenticatedUser, meetsRequires } from "./requires";
import type { McpChoice } from "./select";

/** Who is asking: from the request's cds.context. */
export interface ResourceContext {
  user: unknown;
  tenant?: string;
  locale?: string;
}

export interface FixedResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType: string;
  read(ctx: ResourceContext): string | Promise<string>;
  visible?(ctx: ResourceContext): boolean;
}

export interface TemplateResource {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType: string;
  read(
    ctx: ResourceContext & { uri: string; params: Record<string, string> },
  ): string | Promise<string>;
  list?(ctx: ResourceContext): unknown[] | Promise<unknown[]>;
  complete?(ctx: ResourceContext, param: string, value: string): string[] | Promise<string[]>;
}

/** What the mcp:resources event hands to listeners; registerTemplate is feature-detected. */
export interface ResourceRegistry {
  readonly contractVersion: number;
  register(resource: FixedResource): void;
  registerTemplate?(template: TemplateResource): void;
}

/** CAP's event emitter, as far as this channel uses it. */
interface Events {
  on(event: string, listener: (...args: never[]) => void): unknown;
}

/** What the channel serves: decided at bootstrap. */
export interface ResourcesSetup {
  choice: McpChoice;
  bundles: Bundles;
}

const EVENT = "mcp:resources";
const MIME_TYPE = "text/markdown";
const INDEX = "index.md";
const PATH_VARIABLE = "path";

/**
 * Subscribes to mcp:resources and listening; call it at plugin load (ADR-0010: the plugin emits
 * from its own served listener, and plugin load order isn't fixed). `use` hands it what to serve
 * at bootstrap, which CAP runs before served.
 */
export function gavdiResources(
  cds: Events,
  warn: (message: string) => void,
): { use(setup: ResourcesSetup): void } {
  let setup: ResourcesSetup | undefined;
  let arrived = false;

  cds.on(EVENT, (registry: ResourceRegistry) => {
    arrived = true;
    if (setup !== undefined) registerResources(registry, setup, warn);
  });
  // Checked at listening, after every served listener has run (the maintainers' advice).
  cds.on("listening", () => {
    if (setup !== undefined && !arrived) warn(noEventWarning());
  });

  return {
    use(next) {
      setup = next.choice.as.includes("resources") ? next : undefined;
    },
  };
}

// Synchronously, as the contract asks: the registry closes when the emit returns.
function registerResources(
  registry: ResourceRegistry,
  { choice, bundles }: ResourcesSetup,
  warn: (message: string) => void,
): void {
  if (typeof registry.registerTemplate !== "function") {
    warn(noTemplatesWarning());
    return;
  }
  const { namespace, requires } = choice;
  const sourceFor = (ctx: ResourceContext) =>
    bundles.forKey({ tenant: ctx.tenant, locale: ctx.locale });

  registry.register({
    uri: okfUri(namespace, INDEX),
    name: `okf-${namespace}-index`,
    title: `${namespace} knowledge index`,
    description:
      `Start here: the app's knowledge as Open Knowledge Format concepts. ` +
      `Read a concept as okf://${namespace}/<path>.`,
    mimeType: MIME_TYPE,
    visible: (ctx) => meetsRequires(ctx.user, requires),
    read: async (ctx) => {
      if (!meetsRequires(ctx.user, requires)) throw notFound(INDEX);
      return textFor(ctx, await sourceFor(ctx), INDEX);
    },
  });

  registry.registerTemplate({
    uriTemplate: templateUri(namespace),
    name: `okf-${namespace}-concepts`,
    title: `${namespace} concepts`,
    description: `One concept as Markdown with frontmatter. Find paths in okf://${namespace}/index.md.`,
    mimeType: MIME_TYPE,
    read: async (ctx) => {
      if (!meetsRequires(ctx.user, requires)) throw notFound(ctx.uri);
      const path = decodedPath(ctx.params[PATH_VARIABLE]);
      if (path === undefined) throw notFound(ctx.uri);
      return textFor(ctx, await sourceFor(ctx), path);
    },
    complete: async (ctx, param, value) => {
      if (param !== PATH_VARIABLE || !meetsRequires(ctx.user, requires)) return [];
      const paths = await (await sourceFor(ctx)).list();
      return sortPaths(paths.filter((path) => path.startsWith(value)));
    },
  });
}

// The file's text for the caller: only paths the bundle lists, through the ADR-0003 filter.
async function textFor(ctx: ResourceContext, source: BundleSource, path: string): Promise<string> {
  const listed = (await source.list()).includes(path);
  const text = listed ? await servableText(async () => source, path) : undefined;
  if (text === undefined) throw notFound(path);
  return forReader(text, { isAuthenticated: isAuthenticatedUser(ctx.user) });
}

// params arrive still percent-encoded; decoded exactly once. A malformed escape is "not there".
// A folder ("model/", as index.md links it) reads its index.md, as on the static route.
function decodedPath(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  const path = decoded.endsWith("/") ? `${decoded}${INDEX}` : decoded;
  return isBundlePath(path) ? path : undefined;
}

// What @gavdi/cap-mcp turns into resource-not-found, with the URI only.
function notFound(what: string): Error {
  return Object.assign(new Error(`[okf] ${what} — isn't a resource of the bundle.`), {
    status: 404,
  });
}

/** okf://<namespace>/<path>, each segment encoded as a URI path; checked to be canonical. */
export function okfUri(namespace: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return canonical(`okf://${namespace}/${encoded}`);
}

// The template must be canonical once expanded, as @gavdi/cap-mcp checks it.
function templateUri(namespace: string): string {
  canonical(`okf://${namespace}/v`);
  return `okf://${namespace}/{+${PATH_VARIABLE}}`;
}

function canonical(uri: string): string {
  if (new URL(uri).href !== uri) {
    throw setupError(
      `[okf] cds.okf.serve.mcp.namespace — ${uri} isn't a canonical URI.\n` +
        "  Use a namespace of lower-case letters, digits and -.",
    );
  }
  return uri;
}

function noTemplatesWarning(): string {
  return (
    "[okf] cds.okf.serve.mcp — @gavdi/cap-mcp has no registerTemplate, so no okf:// resources are served.\n" +
    '  Update @gavdi/cap-mcp to a release with mcp:resources contract version 1, or set "as": ["tools"].'
  );
}

function noEventWarning(): string {
  return (
    `[okf] cds.okf.serve.mcp — @gavdi/cap-mcp didn't emit ${EVENT}, so no okf:// resources are served.\n` +
    `  Use @gavdi/cap-mcp 2.x with ${EVENT} (contract version 1), or set "as": ["tools"].`
  );
}
