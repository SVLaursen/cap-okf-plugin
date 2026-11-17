// Reader views over a running server's bundles (reader-view.ts), built on first use and kept
// with the bundle: one snapshot per bundle, one view per kind of reader (authenticated or not,
// and which of the bundle's `requires` roles they have).
import type { BundleSource } from "../bundle/source";
import {
  readerView,
  snapshotOf,
  viewKey,
  type ReaderView,
  type Reader,
  type Snapshot,
} from "./reader-view";

interface Cached {
  snapshot: Snapshot;
  views: Map<string, ReaderView>;
}

const cache = new WeakMap<BundleSource, Promise<Cached>>();

/** The bundle in `source` as `reader` sees it. */
export async function viewOf(source: BundleSource, reader: Reader): Promise<ReaderView> {
  let cached = cache.get(source);
  if (cached === undefined) {
    cached = load(source);
    cache.set(source, cached);
  }
  const { snapshot, views } = await cached;
  const key = viewKey(snapshot, reader);
  let view = views.get(key);
  if (view === undefined) {
    view = readerView(snapshot, reader);
    views.set(key, view);
  }
  return view;
}

async function load(source: BundleSource): Promise<Cached> {
  const files: { path: string; text: string }[] = [];
  for (const path of await source.list()) {
    const text = await source.read(path);
    if (text !== undefined) files.push({ path, text });
  }
  return { snapshot: snapshotOf(files), views: new Map() };
}

/** The reader for a CAP user (cds.context.user or req.user); no user reads as no one. */
export function readerOf(user: unknown): Reader {
  const is = (user as { is?: unknown } | undefined)?.is;
  const has = (role: string) =>
    typeof is === "function" && (is as (role: string) => unknown).call(user, role) === true;
  return { isAuthenticated: has("authenticated-user"), is: has };
}

/**
 * What a channel may hand out as text: a file the reader sees, unless it isn't UTF-8 text
 * (e.g. an image). Generated in memory such a file has no text, and read from disk its bytes
 * come back with replacement characters (U+FFFD).
 */
export function servableIn(view: ReaderView, path: string): string | undefined {
  const text = view.read(path);
  if (text === undefined || path.endsWith(".md")) return text;
  return text === "" || text.includes("�") ? undefined : text;
}
