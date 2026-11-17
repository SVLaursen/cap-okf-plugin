// OkfService's handlers (task 4.5, ADR-0010 Contract B, ADR-0011): the MCP tools channel over
// the server's bundles. Every answer is for the caller: the files they get are filtered for
// them (ADR-0003), and the Index rows are built from those files, so `links` never names a
// concept linked only from inside an authorization section.
import type { Bundles } from "../bundles";
import type { BundleSource } from "../../bundle/source";
import { isBundlePath } from "../../bundle/paths";
import { forReader } from "../../core/filter";
import { OKF_VERSION } from "../../export/exporter";
import type { Cds } from "../../index";
import { servableText } from "../text";
import { bundleHash } from "./bundle-hash";
import { indexRows, type IndexRow } from "./index-rows";
import { IndexQueryError, runIndexQuery, type IndexQuery } from "./index-query";
import { searchConcepts } from "./search";
import type { McpChoice } from "./select";

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
}

/** What one reader sees of one bundle: the files as they get them, and the Index rows. */
interface ReaderView {
  rows: IndexRow[];
}

/** Attaches the handlers to cds.services.OkfService (added with the tools channel, ADR-0005). */
export function attachOkfService(cds: Cds, bundles: Bundles, choice: McpChoice): void {
  const service = (cds.services as unknown as Record<string, Service | undefined>)["OkfService"];
  // Missing OkfService has its own warning at served (tools-model.ts).
  if (service === undefined) return;
  const views = new WeakMap<BundleSource, Map<boolean, Promise<ReaderView>>>();
  const sourceFor = (req: Request) => bundles.forKey({ tenant: req.tenant, locale: req.locale });
  const viewFor = async (req: Request) =>
    readerView(views, await sourceFor(req), isAuthenticated(req));

  // Before CAP's generic handlers, which would answer READ on an entity without persistence
  // with an error: handlers run in the order they are registered.
  service.prepend(() => {
    service.on("READ", "Index", async (req) => {
      const { rows } = await viewFor(req);
      try {
        return runIndexQuery(rows, req.query);
      } catch (error) {
        if (error instanceof IndexQueryError) return req.reject(400, error.message);
        throw error;
      }
    });
    service.on("getConcept", (req) => conceptFor(req, () => sourceFor(req)));
    service.on("searchConcepts", async (req) =>
      searchConcepts((await viewFor(req)).rows, req.data),
    );
    service.on("bundleInfo", async (req) => ({
      okfVersion: OKF_VERSION,
      bundleHash: await hashOf(await sourceFor(req)),
      namespace: choice.namespace,
    }));
  });
}

function isAuthenticated(req: Request): boolean {
  return req.user.is("authenticated-user");
}

// The concept's text as the caller gets it; unknown and unreadable paths alike are a 404.
async function conceptFor(req: Request, source: () => Promise<BundleSource>): Promise<string> {
  const path = req.data["path"];
  const text =
    typeof path === "string" && isBundlePath(path) ? await servableText(source, path) : undefined;
  if (text === undefined) {
    return req.reject(
      404,
      `[okf] ${String(path)} — isn't a file of the bundle.\n` +
        "  Take the path from OkfService.Index or searchConcepts.",
    );
  }
  return forReader(text, { isAuthenticated: isAuthenticated(req) });
}

// One view per bundle and kind of reader, built on first use and kept with the bundle.
function readerView(
  views: WeakMap<BundleSource, Map<boolean, Promise<ReaderView>>>,
  source: BundleSource,
  authenticated: boolean,
): Promise<ReaderView> {
  let byReader = views.get(source);
  if (byReader === undefined) views.set(source, (byReader = new Map()));
  let view = byReader.get(authenticated);
  if (view === undefined) {
    view = buildView(source, authenticated);
    byReader.set(authenticated, view);
  }
  return view;
}

async function buildView(source: BundleSource, authenticated: boolean): Promise<ReaderView> {
  const files = await allFiles(source);
  const filtered = files.map((file) => ({
    path: file.path,
    text: forReader(file.text, { isAuthenticated: authenticated }),
  }));
  return { rows: indexRows(filtered) };
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
