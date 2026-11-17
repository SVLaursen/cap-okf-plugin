// searchConcepts (ADR-0012, revising ADR-0010 Contract B): finds the concepts a reader sees by
// any of the words they give. Pure.
//
// - The text is split into words; stop words such as "the" or "how" are left out unless
//   nothing else is left. A word matches case-insensitively, with simple plural folding
//   ("categories" finds "category"), and a word of four letters or more also matches the start
//   of a longer one ("ship" finds "shipping"), at half the weight. CamelCase names count as
//   separate words.
// - Fields, best first: title; tags and aliases (synonyms in the frontmatter); description;
//   then the text and the path. Each word counts once, where it is found best.
// - Ranking: score, then the number of words found, then curated notes before generated
//   concepts, then path.
// - Never empty for a text: when no word is found, the answer is the curated notes in the
//   order the root index lists them, flagged matched = false, so the agent still gets an
//   outline. The type and tag filters and `top` apply as before.
// The text searched is the text the reader gets (reader-view.ts), so nothing they may not read
// can be probed (ADR-0003).
import { compareText } from "../../core/index-md";
import { isNonEmptyString } from "../../core/values";

export interface SearchOptions {
  text?: string | null;
  type?: string | null;
  tag?: string | null;
  top?: number | null;
}

/** A concept to search, as the reader gets it. */
export interface Searchable {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  curated: boolean;
}

/** One answer: what an agent needs to choose what to read. */
export interface SearchHit {
  path: string;
  type: string | null;
  title: string | null;
  description: string | null;
  /** The concept's tags, comma-separated. */
  tags: string | null;
  /** False when none of the words was found and this is the outline instead. */
  matched: boolean;
}

const DEFAULT_TOP = 20;
const MAX_TOP = 100;
const WEIGHTS = { title: 8, tags: 4, description: 2, text: 1 };
const STOP_WORDS = new Set(
  (
    "a an and are as at be by can do does for from has have how i if in is it its me my of on " +
    "or our that the their this to us was we what when where which who why will with you your"
  ).split(" "),
);
const UNTYPED = "Other";

/** The matching concepts, best first; 20 by default, at most 100. */
export function searchConcepts(
  concepts: readonly Searchable[],
  options: SearchOptions,
): SearchHit[] {
  const top = topOf(options.top);
  const candidates = concepts.filter(
    (concept) => hasType(concept, options.type) && hasTag(concept, options.tag),
  );
  const words = queryWords(options.text ?? "");
  if (words.length === 0)
    return outline(candidates)
      .slice(0, top)
      .map((each) => hitOf(each, true));
  const found = candidates
    .map((concept) => ({ concept, ...scoreOf(concept, words) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.words - a.words ||
        Number(b.concept.curated) - Number(a.concept.curated) ||
        compareText(a.concept.path, b.concept.path),
    );
  if (found.length > 0) return found.slice(0, top).map(({ concept }) => hitOf(concept, true));
  return fallback(candidates, concepts)
    .slice(0, top)
    .map((each) => hitOf(each, false));
}

/** The words of a query, folded; stop words left out unless nothing else is left. */
export function queryWords(text: string): string[] {
  const all = [...new Set(tokensOf(text))];
  const meaningful = all.filter((word) => !STOP_WORDS.has(word));
  return (meaningful.length > 0 ? meaningful : all).map(foldPlural);
}

// "OrderItems, the shipping-KPIs" → ["order", "items", "the", "shipping", "kpis"].
function tokensOf(text: string): string[] {
  return text
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/** Simple English plural folding: "categories" → "category", "boxes" → "box", "kpis" → "kpi". */
export function foldPlural(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// The concept's score (each word counted once, where it is found best) and how many words it has.
function scoreOf(concept: Searchable, words: string[]): { score: number; words: number } {
  const fields = fieldsOf(concept);
  let score = 0;
  let count = 0;
  for (const word of words) {
    const weight = bestWeight(fields, word);
    if (weight > 0) count += 1;
    score += weight;
  }
  return { score, words: count };
}

type Fields = { weight: number; tokens: Set<string> }[];

function fieldsOf(concept: Searchable): Fields {
  const { frontmatter } = concept;
  const field = (weight: number, ...texts: string[]) => ({
    weight,
    tokens: new Set(texts.flatMap(tokensOf).map(foldPlural)),
  });
  return [
    field(WEIGHTS.title, textOf(frontmatter["title"])),
    field(WEIGHTS.tags, ...listOf(frontmatter["tags"]), ...listOf(frontmatter["aliases"])),
    field(WEIGHTS.description, textOf(frontmatter["description"])),
    field(WEIGHTS.text, concept.body, concept.path),
  ];
}

// The weight of the best field the word is in; the start of a longer word counts half.
function bestWeight(fields: Fields, word: string): number {
  let best = 0;
  for (const { weight, tokens } of fields) {
    if (tokens.has(word)) return Math.max(best, weight);
    const isStart = word.length >= 4 && [...tokens].some((token) => token.startsWith(word));
    if (isStart) best = Math.max(best, weight / 2);
  }
  return best;
}

// Nothing found: the curated notes (with the filters, else without), else every concept.
function fallback(candidates: readonly Searchable[], all: readonly Searchable[]): Searchable[] {
  const curated = candidates.filter((concept) => concept.curated);
  if (curated.length > 0) return outline(curated);
  const allCurated = all.filter((concept) => concept.curated);
  return outline(allCurated.length > 0 ? allCurated : candidates);
}

// The order the root index lists concepts in: curated first, by type (untyped last), then path.
function outline(concepts: readonly Searchable[]): Searchable[] {
  const typeOf = (concept: Searchable) => textOf(concept.frontmatter["type"]) || UNTYPED;
  const typeRank = (concept: Searchable) => (typeOf(concept) === UNTYPED ? 1 : 0);
  return [...concepts].sort(
    (a, b) =>
      Number(b.curated) - Number(a.curated) ||
      typeRank(a) - typeRank(b) ||
      compareText(typeOf(a), typeOf(b)) ||
      compareText(a.path, b.path),
  );
}

function hitOf(concept: Searchable, matched: boolean): SearchHit {
  const { frontmatter } = concept;
  const tags = listOf(frontmatter["tags"]);
  return {
    path: concept.path,
    type: textOf(frontmatter["type"]) || null,
    title: textOf(frontmatter["title"]) || null,
    description: textOf(frontmatter["description"]) || null,
    tags: tags.length === 0 ? null : tags.join(","),
    matched,
  };
}

function textOf(value: unknown): string {
  return isNonEmptyString(value) ? value.trim() : "";
}

// One value or a list, as tags and aliases may be written; anything that isn't text is skipped.
function listOf(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter(isNonEmptyString).map((each) => each.trim());
}

function hasType(concept: Searchable, type: string | null | undefined): boolean {
  if (type === undefined || type === null || type === "") return true;
  return textOf(concept.frontmatter["type"]).toLowerCase() === type.toLowerCase();
}

function hasTag(concept: Searchable, tag: string | null | undefined): boolean {
  if (tag === undefined || tag === null || tag === "") return true;
  const tags = listOf(concept.frontmatter["tags"]).map((each) => each.toLowerCase());
  return tags.includes(tag.toLowerCase());
}

function topOf(top: number | null | undefined): number {
  if (top === undefined || top === null || !Number.isFinite(top) || top < 1) return DEFAULT_TOP;
  return Math.min(Math.floor(top), MAX_TOP);
}
