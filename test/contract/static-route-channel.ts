// The static route (task 4.3) as a channel for the server contract (task 4.1): reads over HTTP
// from the app cds.test started, and lists concepts by following the links in index.md files
// from the root, which also checks that every concept can be found. The route has no list of
// its own, so a file that no index links to (log.md, a non-Markdown file, a curated file left
// out of a curated index) isn't listed; the contract also checks `withAuthSection` by name.
import path from "node:path";
import type { Answer, Channel, Reader } from "./server.contract";

type Get = (url: string, config?: object) => Promise<{ status: number; data: unknown }>;

// bob has no roles: authenticated is all the contract needs.
const AUTHENTICATED = { auth: { username: "bob", password: "bob" } };

/** The static route at `route` of the app that `get` talks to. */
export function staticRouteChannel(get: Get, route = "/okf"): Channel {
  const read = async (bundlePath: string, reader: Reader): Promise<Answer> => {
    // The whole path as one encoded value, so "../" reaches the route, which decodes it once;
    // encoded segment by segment, the HTTP client would resolve "%2E%2E" itself.
    const encoded = encodeURIComponent(bundlePath);
    const response = await get(`${route}/${encoded}`, reader === "anonymous" ? {} : AUTHENTICATED);
    if (response.status === 404) return { notFound: "404" };
    if (response.status !== 200)
      throw new Error(`${bundlePath}: unexpected status ${response.status}`);
    return { text: String(response.data) };
  };
  const textOf = async (bundlePath: string, reader: Reader) => {
    const answer = await read(bundlePath, reader);
    return "text" in answer ? answer.text : undefined;
  };
  return { read, list: (reader) => conceptsReachable(textOf, reader) };
}

// Breadth-first from the root index, along relative links to .md files and folders ("model/").
async function conceptsReachable(
  read: (path: string, reader: Reader) => Promise<string | undefined>,
  reader: Reader,
): Promise<string[]> {
  const concepts = new Set<string>();
  const seenIndexes = new Set<string>();
  const queue = ["index.md"];
  while (queue.length > 0) {
    const indexPath = queue.shift()!;
    if (seenIndexes.has(indexPath)) continue;
    seenIndexes.add(indexPath);
    const text = await read(indexPath, reader);
    if (text === undefined) continue;
    for (const target of linkTargets(text)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(indexPath), target));
      if (resolved.endsWith("/")) queue.push(`${resolved}index.md`);
      else if (resolved.endsWith("/index.md") || resolved === "index.md") queue.push(resolved);
      else if (resolved.endsWith(".md") && !isLog(resolved)) concepts.add(resolved);
    }
  }
  return [...concepts].sort();
}

// log.md is reserved (OKF §3.1), at any level; "catalog.md" isn't.
function isLog(bundlePath: string): boolean {
  return bundlePath === "log.md" || bundlePath.endsWith("/log.md");
}

// Relative link targets in "* [Title](target) - description" lines; absolute or external ones
// are left out: indexes link within their folder.
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => decodeURIComponent(match[1]!))
    .filter((target) => !target.startsWith("/") && !/^[a-z]+:/i.test(target));
}
