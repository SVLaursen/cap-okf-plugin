// OkfService's handlers (ADR-0010 Contract B, revised by ADR-0012; ADR-0011): the MCP tools
// channel over the server's bundles. Every answer is for the caller: it comes from the bundle
// as they see it (reader-view.ts), so a concept hidden from them by `requires` is not listed,
// found, linked or readable, and an authorization section reaches authenticated callers only.
import type { Bundles } from "../bundles";
import { isBundlePath } from "../../bundle/paths";
import { OKF_VERSION } from "../../export/exporter";
import type { Cds } from "../../index";
import type { ReaderView } from "../reader-view";
import { withRelated } from "../related";
import { readerOf, servableIn, viewOf } from "../views";
import { bundleHash } from "./bundle-hash";
import { indexRows, type IndexRow } from "./index-rows";
import { IndexQueryError, runIndexQuery, type IndexQuery } from "./index-query";
import { isAuthenticatedUser, meetsRequires } from "./requires";
import { searchConcepts } from "./search";
import type { McpChoice } from "./select";
import type { BundleSource } from "../../bundle/source";

/** The parts of a CAP request the handlers read. */
interface Request {
  user: { is(role: string): boolean };
  tenant?: string;
  locale?: string;
  query: IndexQuery;
  data: Record<string, unknown>;
  reject(code: number, message: string): never;
}

interface Service {
  on(event: string, entity: string, handler: (req: Request) => unknown): void;
  on(event: string, handler: (req: Request) => unknown): void;
  prepend(register: () => void): void;
  before(event: string, handler: (req: Request) => void): void;
}

const INDEX = "index.md";

/** Attaches the handlers to cds.services.OkfService (added with the tools channel, ADR-0005). */
export function attachOkfService(cds: Cds, bundles: Bundles, choice: McpChoice): void {
  const service = (cds.services as unknown as Record<string, Service | undefined>)["OkfService"];
  // Missing OkfService has its own warning at served (tools-model.ts).
  if (service === undefined) return;
  const sourceFor = (req: Request) => bundles.forKey({ tenant: req.tenant, locale: req.locale });
  const viewFor = async (req: Request) => viewOf(await sourceFor(req), readerOf(req.user));

  // Before CAP's generic handlers, which would answer READ on an entity without persistence
  // with an error: handlers run in the order they are registered.
  service.prepend(() => {
    // requires, checked here too: CAP's own service-level check lets in-process calls through
    // for "internal-user", and apps can switch it off (cds.features.service_level_restrictions).
    service.before("*", (req) => checkRequires(req, choice.requires));
    service.on("READ", "Index", async (req) => {
      try {
        return runIndexQuery(rowsOf(await viewFor(req)), req.query);
      } catch (error) {
        if (error instanceof IndexQueryError) return req.reject(400, error.message);
        throw error;
      }
    });
    service.on("getIndex", async (req) => indexFor(req, await viewFor(req)));
    service.on("getConcept", async (req) => conceptFor(req, await viewFor(req), choice.related));
    service.on("searchConcepts", async (req) =>
      searchConcepts((await viewFor(req)).concepts, req.data),
    );
    service.on("bundleInfo", async (req) => ({
      okfVersion: OKF_VERSION,
      bundleHash: await hashOf(await sourceFor(req)),
      namespace: choice.namespace,
    }));
  });
}

// As CAP decides @requires (a privileged user has every role); anonymous callers get 401,
// others 403.
function checkRequires(req: Request, roles: readonly string[]): void {
  if (meetsRequires(req.user, roles)) return;
  if (isAuthenticatedUser(req.user)) req.reject(403, "Forbidden");
  req.reject(401, "Unauthorized");
}

// The index the caller would get from okf://<namespace>/index.md, or a folder's own index.
function indexFor(req: Request, view: ReaderView): string {
  const folder = req.data["folder"];
  const cleaned = typeof folder === "string" ? folder.trim().replace(/^\/+|\/+$/g, "") : "";
  const path = cleaned === "" ? INDEX : `${cleaned}/${INDEX}`;
  const text = isBundlePath(path) ? view.read(path) : undefined;
  if (text === undefined) {
    return req.reject(
      404,
      `[okf] ${cleaned} — isn't a folder of the bundle with an index.\n` +
        "  Call getIndex without a folder, and take folder paths from it.",
    );
  }
  return text;
}

// The concept's text as the caller gets it; unknown, hidden and unreadable paths alike are a 404.
function conceptFor(req: Request, view: ReaderView, related: boolean): string {
  const path = req.data["path"];
  const text = typeof path === "string" && isBundlePath(path) ? servableIn(view, path) : undefined;
  if (text === undefined) {
    return req.reject(
      404,
      `[okf] ${String(path)} — isn't a file of the bundle.\n` +
        "  Take the path from getIndex or searchConcepts.",
    );
  }
  return related ? withRelated(view, path as string, text) : text;
}

// The Index rows of one view, built once.
const rows = new WeakMap<ReaderView, IndexRow[]>();
function rowsOf(view: ReaderView): IndexRow[] {
  let viewRows = rows.get(view);
  if (viewRows === undefined) {
    viewRows = indexRows(view.paths.map((path) => ({ path, text: view.read(path)! })));
    rows.set(view, viewRows);
  }
  return viewRows;
}

// The hash is over the bundle as stored, before filtering (ADR-0010), so every reader gets the
// same one.
const hashes = new WeakMap<BundleSource, Promise<string>>();
function hashOf(source: BundleSource): Promise<string> {
  let hash = hashes.get(source);
  if (hash === undefined) {
    hash = allFiles(source).then(bundleHash);
    hashes.set(source, hash);
  }
  return hash;
}

async function allFiles(source: BundleSource): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const path of await source.list()) {
    const text = await source.read(path);
    if (text !== undefined) files.push({ path, text });
  }
  return files;
}
