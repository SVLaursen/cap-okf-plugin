// Frontmatter and text helpers that every mapper uses, so all concepts look alike.
import type { Frontmatter } from "../../core/concept";
import { oneLine } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { MapperContext } from "./context";

/** The last segment of a fully qualified name: "sample.bookshop.Books" → "Books". */
export function shortName(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1);
}

/** Everything before the last segment, or undefined: "sample.bookshop.Books" → "sample.bookshop". */
export function namespaceOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? undefined : name.slice(0, dot);
}

/** The display title: @title, else the short name. */
export function titleOf(name: string, definition: CsnDefinition, context: MapperContext): string {
  const title = definition["@title"];
  return typeof title === "string" ? oneLine(context.text(title)) : shortName(name);
}

/**
 * The one-line description: @description, else the first sentence of the doc comment.
 * Undefined when there is neither.
 */
export function descriptionOf(
  definition: CsnDefinition,
  context: MapperContext,
): string | undefined {
  const description = definition["@description"];
  if (typeof description === "string") return oneLine(context.text(description));
  return definition.doc === undefined ? undefined : firstSentence(definition.doc);
}

// "A book. Every book has an author." → "A book." Text without a full stop stays whole.
// Simple on purpose: an abbreviation such as "e.g." ends the sentence early.
function firstSentence(text: string): string {
  const line = oneLine(text);
  const end = line.search(/[.!?](\s|$)/);
  return end === -1 ? line : line.slice(0, end + 1);
}

/** The frontmatter every generated concept starts with (spec §4.1). */
export function baseFrontmatter(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
  type: string,
): Frontmatter {
  const description = descriptionOf(definition, context);
  const namespace = namespaceOf(name);
  return {
    type,
    title: titleOf(name, definition, context),
    ...(description === undefined ? {} : { description }),
    resource: `cds:${name}`,
    tags: ["cds", type.toLowerCase(), ...(namespace === undefined ? [] : [namespace])],
  };
}
