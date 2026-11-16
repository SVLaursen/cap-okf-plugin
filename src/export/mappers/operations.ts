// Actions and functions: the same layout for an unbound one's own concept and for a bound one's
// subsection on its entity (maintainer decision for task 2.3). Their @requires and @restrict go
// only into the authorization section (ADR-0003, auth-section.ts).
import { escapeBlock, escapeHtml, oneLine } from "../../core/markdown";
import type { CsnDefinition, CsnElement } from "../csn";
import type { MapperContext } from "./context";
import { elementsTable, typeCell } from "./elements";

/** How a bound operation's kind is named in its subsection: a lookup table, never a branch. */
const OPERATION_TYPES: Readonly<Record<string, string>> = {
  action: "Action",
  function: "Function",
};

/** The parts after the heading and doc comment: parameters, then what it returns. */
export function operationParts(operation: CsnDefinition, context: MapperContext): string[] {
  const parameters = elementsTable("Parameter", callerParameters(operation), context);
  return [...(parameters === undefined ? [] : [parameters]), ...returnsParts(operation, context)];
}

// A bound operation may declare its binding parameter, e.g. "in : $self" or "in : many $self".
// It is the instance the operation is called on, never passed by a caller, so it is left out.
function callerParameters(operation: CsnDefinition): Record<string, CsnElement> {
  const isBinding = (parameter: CsnElement) => (parameter.items ?? parameter).type === "$self";
  return Object.fromEntries(
    Object.entries(operation.params ?? {}).filter(([, parameter]) => !isBinding(parameter)),
  );
}

// "Returns: `Integer`", and for a structure (also "many { … }") a table of what it holds.
function returnsParts(operation: CsnDefinition, context: MapperContext): string[] {
  const returns = operation.returns;
  if (returns === undefined) return [];
  const structure = returns.elements ?? returns.items?.elements;
  const table =
    structure === undefined ? undefined : elementsTable("Returned element", structure, context);
  return [`Returns: ${typeCell(returns, context)}`, ...(table === undefined ? [] : [table])];
}

/**
 * "## Actions" with one "### name" subsection per bound action or function: its kind and doc
 * comment ("Action. Cancels the order."), then the same parts as an unbound one's concept.
 */
export function boundActionsSection(definition: CsnDefinition, context: MapperContext): string[] {
  const actions = Object.entries(definition.actions ?? {});
  if (actions.length === 0) return [];
  const subsections = actions.map(([name, action]) => {
    // CSN always gives a bound operation the kind "action" or "function", so the lookup finds it.
    const kind = OPERATION_TYPES[action.kind!]!;
    const intro = action.doc === undefined ? `${kind}.` : `${kind}. ${escapeBlock(action.doc)}`;
    return [`### ${escapeHtml(oneLine(name))}`, intro, ...operationParts(action, context)].join(
      "\n\n",
    );
  });
  return [["## Actions", ...subsections].join("\n\n")];
}
