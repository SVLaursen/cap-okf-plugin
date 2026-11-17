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
import { startupBundleSource } from "./source";
import { staticRouteOf } from "./static-config";

/** Serves the bundle at cds.okf.serve.static, when that is on. */
export function registerStaticRoute(cds: Cds): void {
  let bundle: Promise<BundleSource> | undefined;
  const log = cds.log("okf");

  cds.on("bootstrap", (app: Application) => {
    // Read here, not at plugin load, so a wrong value stops a server, never cds build.
    const route = staticRouteOf((cds.env as unknown as { okf?: unknown }).okf);
    if (route === undefined) return;
    const source = () => (bundle ??= startupBundleSource(cds, log, process.env));
    // Built before served completes (ADR-0007): a slow model load doesn't slow the first reader.
    cds.on("served", () => {
      source().catch((error: Error) => log.error(error.message));
    });
    const serve = (req: Request, res: Response, next: NextFunction) => {
      serveFile(cds, route, source, req, res).catch(next);
    };
    app.use(route, cds.middlewares.before, serve);
  });
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
  // /okf → /okf/, so the root index's relative links resolve inside the route.
  if (req.path === "/" && !req.originalUrl.split("?")[0]!.endsWith("/")) {
    res.redirect(301, `${route}/`);
    return;
  }
  const bundlePath = bundlePathOf(req.path);
  const text = bundlePath === undefined ? undefined : await (await source()).read(bundlePath);
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

function contentTypeOf(bundlePath: string): string {
  return bundlePath.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
}
