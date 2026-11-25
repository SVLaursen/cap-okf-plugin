// The MCP resources channel through @gavdi/cap-mcp (task 4.6, ADR-0010 Contract A). The plugin
// emits mcp:resources once, from its own served listener; listeners register synchronously.
// cap-okf registers:
// - okf://<namespace>/index.md, a fixed resource, visible only to callers who meet `requires`;
// - okf://<namespace>/{+path}, one template for every concept (read and complete, no list).
// Every answer is the file as the caller sees it (reader-view.ts: ADR-0003 and ADR-0012), and a
// concept read gets its "Read together with" line when cds.okf.serve.mcp.related is on.
// An unknown path, a concept hidden from the caller, a caller who doesn't meet `requires` and a
// malformed escape all throw the same 404, so they look alike.
//
// The plugin is never required (ADR-0004): it is met through its event, and the shapes below are
// declared here, so the published types never reference @gavdi/cap-mcp.
import { isBundlePath, sortPaths } from "../../bundle/paths";
import { setupError } from "../../build/errors";
import type { Bundles } from "../bundles";
import type { ReaderView } from "../reader-view";
import { withReadTogether } from "../related";
import { readerOf, servableIn, viewOf } from "../views";
import { meetsRequires } from "./requires";
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
 * at bootstrap, which CAP runs before served: a setup, or undefined when this server serves no
 * okf:// resources. Every bootstrap calls it, so one server's setup never reaches the next.
 */
export function communityResources(
  cds: Events,
  warn: (message: string) => void,
): { use(setup: ResourcesSetup | undefined): void } {
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
      setup = next;
      arrived = false;
    },
  };
}

// Synchronously, as the contract asks: the registry closes when the emit returns.
function registerResources(
  registry: ResourceRegistry,
  setup: ResourcesSetup,
  warn: (message: string) => void,
): void {
  if (typeof registry.registerTemplate !== "function") {
    warn(noTemplatesWarning());
    return;
  }
  const reading = readingFor(setup);
  registry.register(indexResource(setup.choice, reading));
  registry.registerTemplate(conceptsTemplate(setup.choice, reading));
}

/** How the channel reads for a caller: their view of the bundle, and a file's text in it. */
interface Reading {
  viewFor(ctx: ResourceContext): Promise<ReaderView>;
  textFor(ctx: ResourceContext, path: string): Promise<string>;
}

function readingFor({ choice, bundles }: ResourcesSetup): Reading {
  const viewFor = async (ctx: ResourceContext) =>
    viewOf(await bundles.forKey({ tenant: ctx.tenant, locale: ctx.locale }), readerOf(ctx.user));
  return {
    viewFor,
    async textFor(ctx, path) {
      const view = await viewFor(ctx);
      const text = servableIn(view, path);
      if (text === undefined) throw notFound(path);
      return choice.related ? withReadTogether(view, path, text) : text;
    },
  };
}

function indexResource({ namespace, requires }: McpChoice, reading: Reading): FixedResource {
  return {
    uri: okfUri(namespace, INDEX),
    name: `okf-${namespace}-index`,
    title: `${namespace} business knowledge`,
    description:
      "The outline of this app's business knowledge as Markdown: curated notes with title, " +
      `path and description, then the model in one line. Read a note as okf://${namespace}/<path>.`,
    mimeType: MIME_TYPE,
    visible: (ctx) => meetsRequires(ctx.user, requires),
    read: async (ctx) => {
      if (!meetsRequires(ctx.user, requires)) throw notFound(INDEX);
      return reading.textFor(ctx, INDEX);
    },
  };
}

function conceptsTemplate({ namespace, requires }: McpChoice, reading: Reading): TemplateResource {
  return {
    uriTemplate: templateUri(namespace),
    name: `okf-${namespace}-concepts`,
    title: `${namespace} concepts`,
    description: `One knowledge note or model concept as Markdown. Find paths in okf://${namespace}/index.md.`,
    mimeType: MIME_TYPE,
    read: async (ctx) => {
      if (!meetsRequires(ctx.user, requires)) throw notFound(ctx.uri);
      const path = decodedPath(ctx.params[PATH_VARIABLE]);
      if (path === undefined) throw notFound(ctx.uri);
      return reading.textFor(ctx, path);
    },
    complete: async (ctx, param, value) => {
      if (param !== PATH_VARIABLE || !meetsRequires(ctx.user, requires)) return [];
      const view = await reading.viewFor(ctx);
      // Only paths read can answer: hidden files and files that aren't text are left out.
      const readable = view.paths.filter(
        (path) => path.startsWith(value) && servableIn(view, path) !== undefined,
      );
      return sortPaths(readable);
    },
  };
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
  canonical(`okf://${namespace}/v`); // throws when it isn't canonical
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
