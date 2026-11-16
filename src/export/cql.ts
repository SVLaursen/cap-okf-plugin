// CQL expressions (CXN, https://cap.cloud.sap/docs/cds/cxn) written back as CDL text, e.g. the
// where-condition of an @restrict privilege. Pure.

/**
 * An expression as the text a developer writes in CDS:
 * { xpr: [{ ref: ["country"] }, "=", { ref: ["$user", "country"] }] } → "country = $user.country".
 * A where written in quotes (where: 'country = $user.country') stays a string in CSN and is kept.
 * Anything unknown is shown as JSON, so a condition is never silently lost.
 */
export function renderExpression(expression: unknown): string {
  if (typeof expression === "string") return expression;
  if (Array.isArray(expression)) return renderTokens(expression);
  const node = expression as Record<string, unknown>;
  if (Array.isArray(node["xpr"])) return renderTokens(node["xpr"]);
  return renderToken(expression);
}

// Tokens are operators ("=", "and") or operands, written with spaces between them.
function renderTokens(tokens: unknown[]): string {
  return tokens.map(renderToken).join(" ");
}

function renderToken(token: unknown): string {
  if (typeof token === "string") return token;
  const node = token as Record<string, unknown>;
  if (Array.isArray(node["xpr"])) return `(${renderTokens(node["xpr"])})`;
  if (Array.isArray(node["ref"])) return node["ref"].map(refSegment).join(".");
  if ("val" in node) return renderValue(node["val"]);
  if (typeof node["func"] === "string") {
    const args = Array.isArray(node["args"]) ? node["args"] : [];
    return `${node["func"]}(${args.map(renderToken).join(", ")})`;
  }
  if (Array.isArray(node["list"])) return `(${node["list"].map(renderToken).join(", ")})`;
  if (typeof node["#"] === "string") return `#${node["#"]}`;
  return JSON.stringify(token);
}

/**
 * A path segment: a name, or { id, where } with a filter, or { id, args } with parameters.
 * The filter narrows the condition, so it is always shown: "items[status = 'open']".
 */
function refSegment(segment: unknown): string {
  if (typeof segment === "string") return segment;
  const { id, where, args } = segment as { id: unknown; where?: unknown[]; args?: unknown };
  const filter = where === undefined ? "" : `[${renderTokens(where)}]`;
  return `${String(id)}${argumentsText(args)}${filter}`;
}

// Parameters by name, as CXN writes them: { currency: { val: "EUR" } } → "(currency: 'EUR')".
function argumentsText(args: unknown): string {
  if (args === undefined) return "";
  const named = Object.entries(args as Record<string, unknown>);
  return `(${named.map(([name, value]) => `${name}: ${renderToken(value)}`).join(", ")})`;
}

// Strings in single quotes, a quote doubled, as CDL writes them; everything else as it is.
function renderValue(value: unknown): string {
  return typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value);
}
