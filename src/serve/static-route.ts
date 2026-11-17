// The static route (task 4.3, ADR-0002, ADR-0005 (d), ADR-0007): serves the bundle's files as
// they are, e.g. GET /okf/model/CatalogService/Books.md, when cds.okf.serve.static is on.
// - Mounted at bootstrap (serving.ts) behind cds.middlewares.before, CAP's own chain, so CAP's authentication
//   decides who the user is; anonymous requests are allowed.
// - Every file is served as the reader sees it (reader-view.ts): authorization sections only
//   for authenticated readers (ADR-0003), concepts with `requires` only for readers with one of
//   those roles (ADR-0012). If the filter fails, the reader gets an error, never the unfiltered
//   text.
// - Not listed on CAP's index page: the README shows the route (ADR-0005 (d)).
import type { Application, NextFunction, Request, Response } from "express";
import type { BundleSource } from "../bundle/source";
import { isBundlePath } from "../bundle/paths";
import type { Cds } from "../index";
import type { BundleKey, Bundles } from "./bundles";
import { readerOf, servableIn, viewOf } from "./views";

/**
 * Mounts the static route at `route`, reading from `bundles` (one set per server, shared with
 * the MCP channels; see serving.ts). Called at bootstrap.
 */
export function mountStaticRoute(
  app: Application,
  cds: Cds,
  route: string,
  bundles: Bundles,
): void {
  // Each request reads the bundle for its tenant and locale (ADR-0010).
  const source = () => bundles.forKey(requestKey(cds));
  const serve = (req: Request, res: Response, next: NextFunction) => {
    serveFile(cds, route, source, req, res).catch(next);
  };
  app.use(route, cds.middlewares.before, serve);
}

/** The request's tenant and locale, from CAP's request context. */
export function requestKey(cds: Cds): BundleKey {
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
  // The file as this reader sees it (ADR-0003, ADR-0012): a hidden one is not there at all.
  const user = (cds.context as { user?: unknown } | undefined)?.user;
  const view = await viewOf(await source(), readerOf(user));
  const text = bundlePath === undefined ? undefined : servableIn(view, bundlePath);
  if (bundlePath === undefined || text === undefined) {
    res.status(404).end();
    return;
  }
  res.set("Content-Type", contentTypeOf(bundlePath));
  res.send(text);
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
