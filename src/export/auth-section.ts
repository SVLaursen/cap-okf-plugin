// The authorization section (ADR-0003): the only place in a concept where access rules appear.
// Every server removes it, markers included, unless the requester is authenticated. The markers
// count only as whole lines, and a concept has at most one section (the contract for task 4.2).
//
// The rules are written as CAP's runtime applies them (@sap/cds libx/_runtime/common/generic/auth).
// Maintainer decisions (task 2.4): @readonly, @insertonly and @Capabilities count as access rules;
// a member of a service repeats the service's rules, as CAP applies them to it.
import { inlineCode, oneLine } from "../core/markdown";
import { renderExpression } from "./cql";
import type { CsnDefinition } from "./csn";
import type { MapperContext } from "./mappers/context";
import { linkTo } from "./mappers/shared";

export const AUTH_START = "<!-- okf:auth:start -->";
export const AUTH_END = "<!-- okf:auth:end -->";

// How CAP combines the rules, so an agent doesn't read AND where CAP means OR, or the reverse.
const LEGEND =
  "A request must pass every rule in this section. In a table of privileges, one matching row is enough.";

const BOUND_LEGEND =
  "Its own Requires replaces the entity's; its privileges add to the entity's, granting only this action.";

// Operation kinds and how a bound one is headed: a lookup table, never a branch on kinds.
const OPERATION_HEADINGS: Readonly<Record<string, string>> = {
  action: "Action",
  function: "Function",
};

/** One @restrict privilege, as CSN has it. */
interface Privilege {
  grant?: string | string[];
  to?: string | string[];
  where?: unknown;
}

/** How a definition's own privileges are written: an action grants only itself (see below). */
interface PrivilegeStyle {
  /** For an action or function: its name replaces whatever the privilege grants. */
  grantedOperation?: string;
  /** For a bound action: CAP's runtime ignores the where-condition, so it isn't shown. */
  withoutWhere?: boolean;
}

/**
 * The marked section for a definition: its own rules, those of its bound actions, the composition
 * root it is checked through, and the rules of its service. Nothing when no rule applies.
 */
export function authorizationSection(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
): string[] {
  const parts = [
    ...rulesOf(definition, ownStyle(name, definition)),
    ...boundActionRules(definition),
    ...compositionRoot(definition, context),
    ...serviceRules(name, context),
  ];
  if (parts.length === 0) return [];
  return [[AUTH_START, ["## Authorization", LEGEND, ...parts].join("\n\n"), AUTH_END].join("\n")];
}

// CAP's runtime grants an unbound action or function only itself, whatever "grant" says.
function ownStyle(name: string, definition: CsnDefinition): PrivilegeStyle {
  const isOperation = definition.kind !== undefined && definition.kind in OPERATION_HEADINGS;
  return isOperation ? { grantedOperation: name.slice(name.lastIndexOf(".") + 1) } : {};
}

// The rules declared on one definition: requires, static restrictions, then the privileges.
function rulesOf(definition: CsnDefinition, style: PrivilegeStyle = {}): string[] {
  const capabilities = capabilitiesOf(definition);
  return [
    ...requiresLine(definition["@requires"]),
    ...(definition["@readonly"] === true ? ["Read-only for every user."] : []),
    ...(definition["@insertonly"] === true ? ["Insert-only for every user."] : []),
    ...(capabilities.length === 0 ? [] : [`Capabilities: ${capabilities.join(", ")}`]),
    ...privilegesTable(definition["@restrict"], style),
  ];
}

// "Requires: `Clerk`, `Manager`": any one of the roles is enough. @requires: null removes a
// requirement (no line); an empty list is a requirement no user can meet.
function requiresLine(requires: unknown): string[] {
  if (requires === undefined || requires === null) return [];
  const roles = namesOf(requires);
  if (roles.length === 0) return ["Requires: an empty list, so no user is let in"];
  return [`Requires: ${roles.join(", ")}`];
}

// Flattened OData annotations, e.g. "@Capabilities.DeleteRestrictions.Deletable": false. CAP's
// compiler flattens the structured form too, so one prefix finds both.
function capabilitiesOf(definition: CsnDefinition): string[] {
  const prefix = "@Capabilities.";
  return Object.entries(definition)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => code(`${key.slice(prefix.length)}: ${JSON.stringify(value)}`));
}

// | Grant | To | Where |: one row per privilege. As CAP's runtime reads a privilege: no "grant"
// means every event ("*"), no "to" means any user ("any").
function privilegesTable(restrict: unknown, style: PrivilegeStyle): string[] {
  if (!Array.isArray(restrict) || restrict.length === 0) return [];
  const rows = (restrict as Privilege[]).map((privilege) => {
    const grant =
      style.grantedOperation === undefined
        ? namesOf(privilege.grant ?? "*")
        : [code(style.grantedOperation)];
    const to = namesOf(privilege.to ?? "any");
    const showWhere = privilege.where !== undefined && !style.withoutWhere;
    const where = showWhere ? code(renderExpression(privilege.where)) : "";
    return `| ${[grant.join(", "), to.join(", "), where].map(cell).join(" | ")} |`;
  });
  return [["| Grant | To | Where |", "| --- | --- | --- |", ...rows].join("\n")];
}

// A role, event or list of them as `code` names: "Clerk" → ["`Clerk`"].
function namesOf(value: unknown): string[] {
  const names = Array.isArray(value) ? value : [value];
  return names.map((name) => code(String(name)));
}

// "### Action `cancel`" or "### Function `total`" for each bound operation with rules of its own.
function boundActionRules(definition: CsnDefinition): string[] {
  return Object.entries(definition.actions ?? {}).flatMap(([name, action]) => {
    const rules = rulesOf(action, { grantedOperation: name, withoutWhere: true });
    if (rules.length === 0) return [];
    // CSN always gives a bound operation the kind "action" or "function".
    const heading = OPERATION_HEADINGS[action.kind!]!;
    return [[`### ${heading} ${code(name)}`, BOUND_LEGEND, ...rules].join("\n\n")];
  });
}

/**
 * A child of a composition of aspects ("Orders.items", with an up_ link to its parent) that has no
 * rules of its own is checked through the nearest ancestor that has some, as CAP's runtime does.
 */
function compositionRoot(definition: CsnDefinition, context: MapperContext): string[] {
  if (hasOwnRules(definition)) return [];
  let parent = definition.elements?.["up_"]?.target;
  while (parent !== undefined) {
    const parentDefinition = context.model.definitions[parent];
    if (parentDefinition === undefined) return [];
    if (hasOwnRules(parentDefinition)) {
      return [`Checked through ${linkTo(parent, context)}, the composition it is part of.`];
    }
    parent = parentDefinition.elements?.["up_"]?.target;
  }
  return [];
}

function hasOwnRules(definition: CsnDefinition): boolean {
  return definition["@requires"] !== undefined || definition["@restrict"] !== undefined;
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
 * Model text as `code`, on one line. Only "<!--" is neutralised: inside a code span it can't
 * start HTML, but a role named "<!-- okf:auth:end -->" must never look like a marker to a
 * filter. Any other "<" stays, so a condition such as "stock < 10" stays readable.
 */
function code(text: string): string {
  return inlineCode(oneLine(text).replace(/<!--/g, "&lt;!--"));
}

// A table cell: "|" escaped, so a value can't add a column. Every cell here is `code` already.
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}
