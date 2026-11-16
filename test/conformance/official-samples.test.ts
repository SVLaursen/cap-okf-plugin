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
    files.push({ path: filePath, text: (await source.read(filePath))! });
  }
  return files;
}

async function readConcepts(bundle: string): Promise<{ file: BundleFile; concept: Concept }[]> {
  const markdown = (await readBundle(bundle)).filter((file) => file.path.endsWith(".md"));
  return markdown.map((file) => ({ file, concept: parseConcept(file.path, file.text) }));
}

/** Everything after the frontmatter block, or the whole text when there is none. */
function bodyOf(text: string): string {
  return parseConcept("x.md", text).body;
}

describe.each(BUNDLES)("official sample %s", (bundle) => {
  test("has Markdown files, and every one of them parses", async () => {
    const files = (await readBundle(bundle)).filter((file) => file.path.endsWith(".md"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      expect(() => parseConcept(file.path, file.text)).not.toThrow();
    }
  });

  test("validates without a single finding, not even a warning", async () => {
    expect(validateBundle(await readBundle(bundle))).toEqual([]);
  });

  test("every concept parses back to the same concept after it is serialized", async () => {
    for (const { file, concept } of await readConcepts(bundle)) {
      expect({
        path: file.path,
        concept: parseConcept(file.path, serializeConcept(concept)),
      }).toEqual({
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
    expect(doc).toContain(`${identical} of the ${total} Markdown files`);
  });
});
