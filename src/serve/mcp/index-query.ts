// Answers READ on OkfService.Index from rows in memory (task 4.5, ADR-0010 Contract B). Pure.
// It supports exactly what @gavdi/cap-mcp's Index tools send (checked in its v2 source, PLAN
// 4.5), and refuses anything else with an [okf] message, so a tool never gets a wrong answer:
// - columns: plain element refs, or count(*) as total (the count query, with one: true);
// - from: the entity, or the entity with a key filter (the get tool);
// - where: comparisons (=, !=, <, <=, >, >=), in, is (not) null, contains/startswith/endswith
//   (case-insensitive) and search over listed columns, joined by and;
// - orderBy, limit (rows and offset), one.
import { compareText } from "../../core/index-md";
import type { IndexRow } from "./index-rows";

/** A CQN SELECT, as CAP hands it to a READ handler (req.query). */
export interface IndexQuery {
  SELECT: Record<string, unknown>;
}

type Expression = Record<string, unknown>;

const COLUMNS: readonly (keyof IndexRow)[] = [
  "path",
  "type",
  "title",
  "description",
  "tags",
  "links",
];
const KNOWN_PARTS = ["from", "columns", "where", "orderBy", "limit", "one"];
// What each comparison operator asks of compareText's answer.
const COMPARE: Record<string, (order: number) => boolean> = {
  "=": (order) => order === 0,
  "<": (order) => order < 0,
  "<=": (order) => order <= 0,
  ">": (order) => order > 0,
  ">=": (order) => order >= 0,
};
// "<>" isn't listed: CAP gives it plain SQL meaning (null rows never match), unlike "!=", and
// the tools never send it, so it is refused rather than guessed.
COMPARE["!="] = (order) => order !== 0;
const TEXT_FUNCTIONS = ["contains", "startswith", "endswith"];

/** The rows, page, row or count that `query` asks for. */
export function runIndexQuery(
  rows: readonly IndexRow[],
  query: IndexQuery,
): Partial<IndexRow>[] | Partial<IndexRow> | { total: number } | undefined {
  const select = query.SELECT;
  for (const part of Object.keys(select)) {
    if (select[part] !== undefined && !KNOWN_PARTS.includes(part)) throw unsupported(part);
  }
  const matching = rows.filter(
    (row) => matches(row, keyFilterOf(select["from"])) && matches(row, select["where"]),
  );
  if (isCountQuery(select["columns"])) return { total: matching.length };
  const page = paged(ordered(matching, select["orderBy"]), select["limit"]);
  const answer = page.map((row) => projectedRow(row, select["columns"]));
  return select["one"] === true ? answer[0] : answer;
}

/** An [okf] error for a query OkfService.Index doesn't answer; the handler answers 400. */
export class IndexQueryError extends Error {
  readonly status = 400;
}

function unsupported(what: string): IndexQueryError {
  return new IndexQueryError(
    `[okf] OkfService.Index — ${what} isn't supported.\n` +
      "  Filter with =, !=, <, >, in, contains, startswith, endswith or search, joined by and; " +
      "or use searchConcepts.",
  );
}

// The get tool's key filter: from: { ref: [{ id, where }] }.
// Only the entity itself, or it with a key filter; a sub-select or a path is refused.
function keyFilterOf(from: unknown): unknown {
  const ref = (from as { ref?: unknown[] } | undefined)?.ref;
  if (!Array.isArray(ref) || ref.length !== 1) throw unsupported("this from clause");
  const first = ref[0];
  return typeof first === "object" && first !== null ? (first as Expression)["where"] : undefined;
}

function isCountQuery(columns: unknown): boolean {
  if (!Array.isArray(columns) || columns.length !== 1) return false;
  const column = columns[0] as Expression;
  return column["func"] === "count";
}

/** Whether `row` meets `where`: conditions joined by "and" ("or" is refused). */
function matches(row: IndexRow, where: unknown): boolean {
  if (where === undefined || where === null) return true;
  if (!Array.isArray(where)) throw unsupported("this where clause");
  return conditionsOf(where).every((condition) => meets(row, condition));
}

// Splits a where array at its top-level "and"s.
function conditionsOf(where: unknown[]): unknown[][] {
  const conditions: unknown[][] = [[]];
  for (const token of where) {
    if (token === "and") conditions.push([]);
    else if (token === "or" || token === "not") throw unsupported(`"${token}"`);
    else conditions[conditions.length - 1]!.push(token);
  }
  return conditions;
}

function meets(row: IndexRow, condition: unknown[]): boolean {
  const [first] = condition as [Expression];
  if (condition.length === 1 && Array.isArray(first?.["xpr"])) return matches(row, first["xpr"]);
  if (condition.length === 1 && typeof first?.["func"] === "string") {
    return meetsFunction(row, first);
  }
  if (condition.length !== 3) throw unsupported("this condition");
  return meetsComparison(row, condition as [Expression, unknown, Expression]);
}

// [column, operator, value]: a comparison, in, or is (not) null.
function meetsComparison(
  row: IndexRow,
  [column, operator, value]: [Expression, unknown, Expression],
): boolean {
  const actual = valueOf(row, column);
  if (operator === "in" || operator === "is" || operator === "is not") {
    return meetsListOrNull(actual, operator, value);
  }
  const test = typeof operator === "string" ? COMPARE[operator] : undefined;
  if (test === undefined) throw unsupported(`the operator ${JSON.stringify(operator)}`);
  const expected = literalOf(value);
  // As CAP's databases do: a comparison with null is never true, except != (IS DISTINCT FROM),
  // which is true when exactly one side is null.
  if (actual === null || expected === null) return test === COMPARE["!="] && actual !== expected;
  return test(compareText(actual, String(expected)));
}

function meetsListOrNull(actual: string | null, operator: string, value: Expression): boolean {
  if (operator === "in") return listOf(value).includes(actual);
  isNullCheck(value);
  return operator === "is" ? actual === null : actual !== null;
}

function meetsFunction(row: IndexRow, call: Expression): boolean {
  const name = String(call["func"]).toLowerCase();
  const [target, needle] = (call["args"] ?? []) as Expression[];
  const text = String(literalOf(needle) ?? "").toLowerCase();
  if (name === "search")
    return searchedColumns(target).some((column) => lower(row[column]).includes(text));
  if (!TEXT_FUNCTIONS.includes(name)) throw unsupported(`the function ${name}`);
  const actual = lower(valueOf(row, target));
  if (name === "contains") return actual.includes(text);
  return name === "startswith" ? actual.startsWith(text) : actual.endsWith(text);
}

// search's first argument: one column ref, or a list of them.
function searchedColumns(target: Expression | undefined): (keyof IndexRow)[] {
  const refs = Array.isArray(target?.["list"]) ? (target["list"] as Expression[]) : [target];
  return refs.map((ref) => columnOf(ref));
}

function valueOf(row: IndexRow, ref: Expression | undefined): string | null {
  return row[columnOf(ref)];
}

function columnOf(ref: Expression | undefined): keyof IndexRow {
  const path = ref?.["ref"];
  if (ref?.["expand"] !== undefined) throw unsupported("an expand");
  const name = Array.isArray(path) && path.length === 1 ? path[0] : undefined;
  if (typeof name !== "string" || !COLUMNS.includes(name as keyof IndexRow)) {
    throw unsupported(`the column ${JSON.stringify(path ?? ref)}`);
  }
  return name as keyof IndexRow;
}

function literalOf(value: Expression | undefined): unknown {
  if (value === undefined || !("val" in value)) throw unsupported("a value that isn't a literal");
  return value["val"];
}

function listOf(value: Expression | undefined): unknown[] {
  if (!Array.isArray(value?.["list"])) throw unsupported("in without a list");
  return (value["list"] as Expression[]).map(literalOf);
}

// "is" and "is not" only ever compare with null.
function isNullCheck(value: Expression | undefined): void {
  if (literalOf(value) !== null) throw unsupported("is with a value other than null");
}

function lower(value: string | null): string {
  return (value ?? "").toLowerCase();
}

function ordered(rows: IndexRow[], orderBy: unknown): IndexRow[] {
  if (orderBy === undefined) return rows;
  if (!Array.isArray(orderBy)) throw unsupported("this orderBy");
  const keys = (orderBy as Expression[]).map((entry) => ({
    column: columnOf(entry),
    direction: entry["sort"] === "desc" ? -1 : 1,
  }));
  return [...rows].sort((a, b) => {
    for (const { column, direction } of keys) {
      const order = compareText(a[column] ?? "", b[column] ?? "");
      if (order !== 0) return order * direction;
    }
    return 0;
  });
}

function paged(rows: IndexRow[], limit: unknown): IndexRow[] {
  if (limit === undefined) return rows;
  const { rows: count, offset } = limit as { rows?: Expression; offset?: Expression };
  const start = offset === undefined ? 0 : Number(literalOf(offset));
  const size = count === undefined ? rows.length : Number(literalOf(count));
  return rows.slice(start, start + size);
}

function projectedRow(row: IndexRow, columns: unknown): Partial<IndexRow> {
  if (columns === undefined) return { ...row };
  if (!Array.isArray(columns)) throw unsupported("these columns");
  const result: Record<string, string | null> = {};
  for (const column of columns as Expression[]) {
    const name = columnOf(column);
    result[name] = row[name];
  }
  return result;
}
