// Where a generated concept lives in the bundle (ADR-0007, "What the bundle contains" and
// "Path rules"). Pure.

/** Every generated concept lives below this folder. */
export const MODEL_FOLDER = "model";

// Windows can't create files or folders with these names, whatever the extension.
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// OKF reserves these file names at every level of a bundle (spec §3.1).
const OKF_RESERVED_NAMES = /^(index|log)$/i;

/**
 * The bundle path of a definition's concept: each segment of the fully qualified name but the
 * last becomes a folder, the last one the file.
 * "sample.bookshop.Books" → "model/sample/bookshop/Books.md".
 */
export function conceptPathFor(name: string): string {
  const segments = name.split(".").map(encodeSegment);
  return `${MODEL_FOLDER}/${segments.join("/")}.md`;
}

/**
 * How other concepts link to a definition's concept: the absolute bundle path (spec §6.1),
 * encoded once more as a URI path, so a file named "b%25c.md" is linked as "b%2525c.md".
 */
export function conceptLinkFor(name: string): string {
  return "/" + conceptPathFor(name).split("/").map(encodeURIComponent).join("/");
}

// ADR-0007: keep A–Z a–z 0–9 . _ -, percent-encode everything else (UTF-8), and add "_" to
// names no file system or OKF reader can take as they are. (ADR-0007 also suffixes names ending
// in a dot; a segment can't, because names are split at their dots.)
function encodeSegment(segment: string): string {
  const encoded = [...new TextEncoder().encode(segment)]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return /[A-Za-z0-9._-]/.test(character) ? character : `%${hex(byte)}`;
    })
    .join("");
  return needsSuffix(encoded) ? `${encoded}_` : encoded;
}

function hex(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

function needsSuffix(segment: string): boolean {
  return OKF_RESERVED_NAMES.test(segment) || WINDOWS_DEVICE_NAMES.test(segment);
}
