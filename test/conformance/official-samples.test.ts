import fs from "node:fs";
import path from "node:path";
import { FileBundleSource } from "../../src/bundle/source";
import { parseConcept, serializeConcept, type Concept } from "../../src/core/concept";
import { validateBundle, type BundleFile } from "../../src/core/validate";

// The conformance suite: cap-okf reads, checks and writes every official OKF v0.2 sample
// bundle (test/fixtures/okf-spec/bundles, copied from the spec repository) without losing
// anything. What "without losing anything" means, and why it isn't "byte for byte", is
// written down in docs/conformance.md.

const BUNDLES_DIR = path.join(__dirname, "..", "fixtures", "okf-spec", "bundles");
const CONFORMANCE_DOC = path.join(__dirname, "..", "..", "docs", "conformance.md");

const BUNDLES = ["acme_retail", "crypto_bitcoin", "ga4", "stackoverflow"];

/** Every file of a bundle, read through the same BundleSource the servers use. */
async function readBundle(bundle: string): Promise<BundleFile[]> {
  const source = new FileBundleSource(path.join(BUNDLES_DIR, bundle));
  const files: BundleFile[] = [];
  for (const filePath of await source.list()) {
    const text = await source.read(filePath);
    if (text === undefined) throw new Error(`${bundle}/${filePath}: listed, but can't be read`);
    files.push({ path: filePath, text });
  }
  return files;
}

async function readConcepts(bundle: string): Promise<{ file: BundleFile; concept: Concept }[]> {
  const markdown = (await readBundle(bundle)).filter((file) => file.path.endsWith(".md"));
  return markdown.map((file) => ({ file, concept: parseNamingTheFile(file) }));
}

// A parse error carries the file in a property Jest doesn't print; put it in the message.
function parseNamingTheFile(file: BundleFile): Concept {
  try {
    return parseConcept(file.path, file.text);
  } catch (error) {
    throw new Error(`${file.path}: ${(error as Error).message}`, { cause: error });
  }
}

/** Everything after the frontmatter block, or the whole text when there is none. */
function bodyOf(text: string): string {
  return parseConcept("x.md", text).body;
}

test("every sample bundle in the fixtures is in the suite", () => {
  const folders = fs
    .readdirSync(BUNDLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  expect(folders).toEqual(BUNDLES);
});

// Each assertion below compares { path, … } objects, so a failure names the file that broke.
describe.each(BUNDLES)("official sample %s", (bundle) => {
  test("has Markdown files, and every one of them parses", async () => {
    const files = (await readBundle(bundle)).filter((file) => file.path.endsWith(".md"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(() => parseNamingTheFile(file)).not.toThrow();
    }
  });

  test("validates without a single finding, not even a warning", async () => {
    expect(validateBundle(await readBundle(bundle))).toEqual([]);
  });

  test("every concept parses back to the same concept after it is serialized", async () => {
    for (const { file, concept } of await readConcepts(bundle)) {
      const parsedAgain = parseConcept(file.path, serializeConcept(concept));
      expect({ path: file.path, concept: parsedAgain }).toStrictEqual({
        path: file.path,
        concept,
      });
    }
  });

  test("serializing is stable: writing a written file again gives the same bytes", async () => {
    for (const { file, concept } of await readConcepts(bundle)) {
      const once = serializeConcept(concept);
      const twice = serializeConcept(parseConcept(file.path, once));
      expect({ path: file.path, twice }).toEqual({ path: file.path, twice: once });
    }
  });

  // docs/conformance.md: only the frontmatter's formatting may change.
  test("the body comes back byte for byte, and files without frontmatter come back unchanged", async () => {
    for (const { file, concept } of await readConcepts(bundle)) {
      const written = serializeConcept(concept);
      const expected = concept.frontmatter === null ? file.text : bodyOf(file.text);
      const actual = concept.frontmatter === null ? written : bodyOf(written);
      expect({ path: file.path, text: actual }).toEqual({ path: file.path, text: expected });
    }
  });
});

describe("docs/conformance.md", () => {
  // Pins the numbers the document gives, so a change in the serializer's style that makes
  // more or fewer files byte-identical can't go unnoticed.
  test("states how many sample files round-trip byte for byte", async () => {
    let total = 0;
    let identical = 0;
    for (const bundle of BUNDLES) {
      for (const { file, concept } of await readConcepts(bundle)) {
        total++;
        if (serializeConcept(concept) === file.text) identical++;
      }
    }
    const doc = fs.readFileSync(CONFORMANCE_DOC, "utf8");
    const notGuaranteed = doc.slice(doc.indexOf("## What is not guaranteed"));
    const firstSentence = notGuaranteed.slice(0, notGuaranteed.indexOf(". "));
    expect(firstSentence).toContain(`${identical} of the ${total} Markdown files`);
  });
});
