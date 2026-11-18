// The directive parts of OkfService's tool descriptions (ADR-0013). srv/okf-service.cds holds
// neutral descriptions: what each tool returns. The part that says when to read is kept here,
// because it must not reach a caller who sees no curated notes: in a bundle with generated
// concepts only, "read this first" makes an agent spend calls on what the tools already say.
//
// - Through @gavdi/cap-mcp with signals "auto", the directive part is a tool note (mcp:hints),
//   added per caller only when they see curated notes (gavdi-hints.ts).
// - With signals "always", or through @cap-js/mcp (which has no hints), it is added to the
//   descriptions in the model once, for everyone (tools-model.ts).
//
// The instruction to read is tied to need, not unconditional: a plain read of one record by its
// key or name doesn't need the notes.

import { CAP_JS_MCP, type McpChoice } from "./select";

/** The service whose tools these are. */
export const OKF_SERVICE = "OkfService";

const DIRECTIVES: Readonly<Record<string, string>> = {
  [`${OKF_SERVICE}.getIndex`]:
    "Read it when a request uses a business term, code, status value, named figure or KPI, " +
    "time or unit convention, or asks for an action, not for a plain read of one record by key. " +
    "Notes have gaps: if what you need isn't defined there or in the data, say so.",
  [`${OKF_SERVICE}.getConcept`]:
    'Its "Read together with" line names linked notes that often hold the other half of an ' +
    "answer: read them all in your next call. Read the matching note before filtering on " +
    "a code, computing a named figure or calling an action.",
  [`${OKF_SERVICE}.searchConcepts`]:
    "Use it when a request names a business term, code, status value or KPI you don't know, " +
    "then read the paths it returns with getConcept.",
};

/** The directive part of an OkfService tool's description, by its CDS definition name. */
export function directiveFor(definition: string): string | undefined {
  return DIRECTIVES[definition];
}

/** Every OkfService definition that has a directive part. */
export function directiveDefinitions(): string[] {
  return Object.keys(DIRECTIVES);
}

/** A neutral description followed by its directive part, as one paragraph. */
export function withDirective(neutral: string, definition: string): string {
  const directive = directiveFor(definition);
  return directive === undefined ? neutral : `${neutral} ${directive}`;
}

/**
 * Whether the directive parts go into the model for everyone: with signals "always", or through
 * @cap-js/mcp, which has no way to add them per caller.
 */
export function directivesInModel(choice: McpChoice): boolean {
  return choice.signals === "always" || choice.plugin === CAP_JS_MCP;
}
