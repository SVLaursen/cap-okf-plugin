// What a channel may hand out as text (tasks 4.3, 4.5): a file of the bundle, unless it isn't
// UTF-8 text (e.g. an image): generated in memory such a file has no text, and read from disk
// its bytes come back with replacement characters (U+FFFD).
import type { BundleSource } from "../bundle/source";

/** The file's text, or undefined when it's not in the bundle or isn't UTF-8 text. */
export async function servableText(
  source: () => Promise<BundleSource>,
  bundlePath: string,
): Promise<string | undefined> {
  const text = await (await source()).read(bundlePath);
  if (text === undefined || bundlePath.endsWith(".md")) return text;
  return text === "" || text.includes("�") ? undefined : text;
}
