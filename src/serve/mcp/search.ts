// searchConcepts (ADR-0010 Contract B): Index rows whose title, tags, description or path
// contain every word of the text, case-insensitive, ranked in that order; optionally only one type or tag.
// Never the concept's text, so the authorization section can't be probed (ADR-0003). Pure.
import { compareText } from "../../core/index-md";
import type { IndexRow } from "./index-rows";

export interface SearchOptions {
  text?: string | null;
  type?: string | null;
  tag?: string | null;
  top?: number | null;
}

const DEFAULT_TOP = 20;
const MAX_TOP = 100;

/** The matching rows, best first, then by path; 20 by default, at most 100. */
export function searchConcepts(rows: readonly IndexRow[], options: SearchOptions): IndexRow[] {
  const words = (options.text ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  const scored = rows
    .filter((row) => hasType(row, options.type) && hasTag(row, options.tag))
    .map((row) => ({ row, score: scoreOf(row, words) }))
    .filter(({ score }) => words.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.row.path, b.row.path));
  return scored.slice(0, topOf(options.top)).map(({ row }) => row);
}

// Every word must appear somewhere; each counts by where it is found, title over tags over
// description over path. 0 when a word is missing.
function scoreOf(row: IndexRow, words: string[]): number {
  let score = 0;
  for (const word of words) {
    const found = fieldScore(row, word);
    if (found === 0) return 0;
    score += found;
  }
  return score;
}

function fieldScore(row: IndexRow, word: string): number {
  const has = (value: string | null) => (value ?? "").toLowerCase().includes(word);
  if (has(row.title)) return 4;
  if (has(row.tags)) return 3;
  if (has(row.description)) return 2;
  return has(row.path) ? 1 : 0;
}

function hasType(row: IndexRow, type: string | null | undefined): boolean {
  if (type === undefined || type === null || type === "") return true;
  return (row.type ?? "").toLowerCase() === type.toLowerCase();
}

function hasTag(row: IndexRow, tag: string | null | undefined): boolean {
  if (tag === undefined || tag === null || tag === "") return true;
  const tags = (row.tags ?? "").split(",").map((each) => each.trim().toLowerCase());
  return tags.includes(tag.toLowerCase());
}

function topOf(top: number | null | undefined): number {
  if (top === undefined || top === null || !Number.isFinite(top) || top < 1) return DEFAULT_TOP;
  return Math.min(Math.floor(top), MAX_TOP);
}
