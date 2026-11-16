// The authorization section (ADR-0003): the only place in a concept where access rules appear.
// Every server removes it, markers included, unless the requester is authenticated.
// Maintainer decisions (task 2.4): @readonly, @insertonly and @Capabilities count as access
// rules; a member of a service repeats the service's rules, as CAP applies them to it.
import { escapeHtml, inlineCode, oneLine, tableCell } from "../core/markdown";
import { renderExpression } from "./cql";
import type { CsnDefinition } from "./csn";
import type { MapperContext } from "./mappers/context";
import { linkTo } from "./mappers/shared";

export const AUTH_START = "<!-- okf:auth:start -->";
export const AUTH_END = "<!-- okf:auth:end -->";

/** One @restrict privilege, as CSN has it. */
interface Privilege {
  grant?: string | string[];
  to?: string | string[];
  where?: unknown;
}

/**
 * The marked section for a definition: its own rules, those of its bound actions, and those of
 * its service. Nothing when no rule applies.
 */
export function authorizationSection(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
): string[] {
  const parts = [
    ...rulesOf(definition),
    ...boundActionRules(definition),
    ...serviceRules(name, context),
  ];
  if (parts.length === 0) return [];
  return [[AUTH_START, ["## Authorization", ...parts].join("\n\n"), AUTH_END].join("\n")];
}

// The rules declared on one definition: requires, static restrictions, then the privileges.
function rulesOf(definition: CsnDefinition): string[] {
  const capabilities = capabilitiesOf(definition);
  return [
    ...requiresLine(definition["@requires"]),
    ...(definition["@readonly"] === true ? ["Read-only for every user."] : []),
    ...(definition["@insertonly"] === true ? ["Insert-only for every user."] : []),
    ...(capabilities.length === 0 ? [] : [`Capabilities: ${capabilities.join(", ")}`]),
    ...privilegesTable(definition["@restrict"]),
  ];
}

// "Requires: `Clerk`, `Manager`": any one of the roles is enough.
function requiresLine(requires: unknown): string[] {
  if (requires === undefined) return [];
  return [`Requires: ${namesOf(requires).join(", ")}`];
}

// Flattened OData annotations, e.g. "@Capabilities.DeleteRestrictions.Deletable": false.
function capabilitiesOf(definition: CsnDefinition): string[] {
  const prefix = "@Capabilities.";
  return Object.entries(definition)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => code(`${key.slice(prefix.length)}: ${JSON.stringify(value)}`));
}

// | Grant | To | Where |: one row per privilege. A privilege without "to" applies to any user.
function privilegesTable(restrict: unknown): string[] {
  if (!Array.isArray(restrict) || restrict.length === 0) return [];
  const rows = (restrict as Privilege[]).map((privilege) => {
    const to = privilege.to === undefined ? [code("any")] : namesOf(privilege.to);
    const where = privilege.where === undefined ? "" : code(renderExpression(privilege.where));
    // CAP's docs give no default for a missing grant, so none is invented: the cell stays empty.
    const grant = privilege.grant === undefined ? "" : namesOf(privilege.grant).join(", ");
    const cells = [grant, to.join(", "), where];
    return `| ${cells.map(tableCell).join(" | ")} |`;
  });
  return [["| Grant | To | Where |", "| --- | --- | --- |", ...rows].join("\n")];
}

// A role, event or list of them as `code` names: "Clerk" → ["`Clerk`"].
function namesOf(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [value];
  return names.map((name) => code(String(name)));
}

// "### Action `cancel`" for each bound action or function that has rules of its own.
function boundActionRules(definition: CsnDefinition): string[] {
  return Object.entries(definition.actions ?? {}).flatMap(([name, action]) => {
    const rules = rulesOf(action);
    if (rules.length === 0) return [];
    return [[`### Action ${code(name)}`, ...rules].join("\n\n")];
  });
}

// "### From service [S](…)": the rules of the service the definition belongs to, if any.
function serviceRules(name: string, context: MapperContext): string[] {
  const service = serviceOf(name, context);
  if (service === undefined) return [];
  const rules = rulesOf(context.model.definitions[service]!);
  if (rules.length === 0) return [];
  return [[`### From service ${linkTo(service, context)}`, ...rules].join("\n\n")];
}

// The nearest enclosing service: for "S.Books.texts" that is "S", if S is a service.
function serviceOf(name: string, context: MapperContext): string | undefined {
  const segments = name.split(".");
  for (let length = segments.length - 1; length > 0; length--) {
    const candidate = segments.slice(0, length).join(".");
    if (context.model.definitions[candidate]?.kind === "service") return candidate;
  }
  return undefined;
}

/**
 * Model text as `code`, on one line and with "<" escaped. Even inside a code span, a role named
 * "<!-- okf:auth:end -->" must never look like the end marker to a filter that strips the
 * section, or the rules after it would leak.
 */
function code(text: string): string {
  return inlineCode(escapeHtml(oneLine(text)));
}
