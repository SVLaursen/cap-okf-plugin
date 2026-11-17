// The static route (task 4.3) as a channel for the server contract (task 4.1): reads over HTTP
// from the app cds.test started, and lists concepts by following the links in index.md files
// from the root, which also checks that every concept can be found.
import path from "node:path";
import type { Channel, Reader } from "./server.contract";

type Get = (url: string, config?: object) => Promise<{ status: number; data: unknown }>;

// bob has no roles: authenticated is all the contract needs.
const AUTHENTICATED = { auth: { username: "bob", password: "bob" } };

/** The static route at `route` of the app that `get` talks to. */
export function staticRouteChannel(get: Get, route = "/okf"): Channel {
  const read = async (bundlePath: string, reader: Reader) => {
    // Every segment encoded, dots too, so "../" reaches the route instead of being resolved by
    // the HTTP client.
    const encoded = bundlePath
      .split("/")
      .map((segment) => encodeURIComponent(segment).replace(/\./g, "%2E"))
      .join("/");
    const response = await get(
      `${route}/${encoded}`,
      reader === "authenticated" ? AUTHENTICATED : {},
    );
    if (response.status === 404) return undefined;
    if (response.status !== 200)
      throw new Error(`${bundlePath}: unexpected status ${response.status}`);
    return String(response.data);
  };
  return { read, list: (reader) => conceptsReachable(read, reader) };
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
      else if (resolved.endsWith(".md") && !resolved.endsWith("log.md")) concepts.add(resolved);
    }
  }
  return [...concepts].sort();
}

// Relative link targets in "* [Title](target) - description" lines; absolute or external ones
// are left out: indexes link within their folder.
function linkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => decodeURIComponent(match[1]!))
    .filter((target) => !target.startsWith("/") && !/^[a-z]+:/i.test(target));
}
