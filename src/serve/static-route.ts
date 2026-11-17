// The static route (task 4.3, ADR-0002, ADR-0005 (d), ADR-0007): serves the bundle's files as
// they are, e.g. GET /okf/model/CatalogService/Books.md, when cds.okf.serve.static is on.
// - Mounted at bootstrap behind cds.middlewares.before, CAP's own chain, so CAP's authentication
//   decides who the user is; anonymous requests are allowed.
// - Authorization sections are removed for readers who aren't authenticated (ADR-0003). If the
//   filter fails, the reader gets an error, never the unfiltered text.
// - Not listed on CAP's index page: the README shows the route (ADR-0005 (d)).
import type { Application, NextFunction, Request, Response } from "express";
import type { BundleSource } from "../bundle/source";
import { isBundlePath } from "../bundle/paths";
import { forReader } from "../core/filter";
import type { Cds } from "../index";
import { oneBundleForEveryKey, type BundleKey } from "./bundles";
import { startupBundleSource } from "./source";
import { staticRouteOf } from "./static-config";

/** Serves the bundle at cds.okf.serve.static, when that is on. */
export function registerStaticRoute(cds: Cds): void {
  const log = cds.log("okf");

  cds.on("bootstrap", (app: Application) => {
    // Read here, not at plugin load, so a wrong value stops a server, never cds build.
    const route = staticRouteOf((cds.env as unknown as { okf?: unknown }).okf);
    if (route === undefined) return;
    // One set of bundles per server: a process may boot more than one app.
    const bundles = oneBundleForEveryKey(() => startupBundleSource(cds, log, process.env));
    // Each request reads the bundle for its tenant and locale (ADR-0010).
    const source = () => bundles.forKey(requestKey(cds));
    // Built before served completes (ADR-0007), so later served listeners (MCP, task 4.6) find
    // it. A setup error, such as okf being a file, stops startup; curated files with errors don't
    // (they are left out, see source.ts). CAP waits for a promise a served listener returns
    // (@sap/cds lib/index.js), though its types declare the listener as returning nothing.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cds.on("served", () => bundles.forKey({}).then(() => undefined));
    const serve = (req: Request, res: Response, next: NextFunction) => {
      serveFile(cds, route, source, req, res).catch(next);
    };
    app.use(route, cds.middlewares.before, serve);
  });
}

// The request's tenant and locale, from CAP's request context.
function requestKey(cds: Cds): BundleKey {
  const context = cds.context as { tenant?: string; locale?: string } | undefined;
  return { tenant: context?.tenant, locale: context?.locale };
}

async function serveFile(
  cds: Cds,
  route: string,
  source: () => Promise<BundleSource>,
  req: Request,
  res: Response,
): Promise<void> {
  // What a reader gets depends on who asks, so no shared cache may keep it.
  res.set("Cache-Control", "private, no-cache");
  res.set("Vary", "Authorization, Cookie");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD").status(405).end();
    return;
  }
  // /okf → okf/, so the root index's relative links resolve inside the route. Relative, so a
  // proxy that changes the prefix still works; temporary (302), so browsers don't keep it.
  if (req.path === "/" && !req.originalUrl.split("?")[0]!.endsWith("/")) {
    res.redirect(302, `${route.slice(route.lastIndexOf("/") + 1)}/`);
    return;
  }
  const bundlePath = bundlePathOf(req.path);
  const text = bundlePath === undefined ? undefined : await servableText(source, bundlePath);
  if (bundlePath === undefined || text === undefined) {
    res.status(404).end();
    return;
  }
  const user = (cds.context as { user?: { is(role: string): boolean } } | undefined)?.user;
  const isAuthenticated = user?.is("authenticated-user") === true;
  res.set("Content-Type", contentTypeOf(bundlePath));
  res.send(forReader(text, { isAuthenticated }));
}

/**
 * The bundle path a request path asks for, decoded once: "/" → "index.md", "/model/" →
 * "model/index.md". Undefined for anything that isn't a bundle path (e.g. "..", a bad %).
 */
function bundlePathOf(requestPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.slice(1));
  } catch {
    return undefined;
  }
  const path = decoded === "" || decoded.endsWith("/") ? `${decoded}index.md` : decoded;
  return isBundlePath(path) ? path : undefined;
}

// The file's text, or undefined when it's not in the bundle or isn't UTF-8 text (e.g. an image):
// generated in memory such a file has no text, and read from disk its bytes come back with
// replacement characters (U+FFFD).
async function servableText(
  source: () => Promise<BundleSource>,
  bundlePath: string,
): Promise<string | undefined> {
  const text = await (await source()).read(bundlePath);
  if (text === undefined || bundlePath.endsWith(".md")) return text;
  return text === "" || text.includes("\uFFFD") ? undefined : text;
}

function contentTypeOf(bundlePath: string): string {
  return bundlePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
}
