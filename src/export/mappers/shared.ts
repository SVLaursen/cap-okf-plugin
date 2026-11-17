// Frontmatter and text helpers that every mapper uses, so all concepts look alike.
import type { Frontmatter } from "../../core/concept";
import { escapeHtml, escapeLinkText, oneLine } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import { conceptLinkFor } from "../paths";
import type { MapperContext } from "./context";
import { sourceChain } from "./sources";

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

/**
 * The definition's description, else that of the first definition down its source chain that has
 * one: a projection on a projection on Books gets Books' description.
 */
export function inheritedDescription(
  definition: CsnDefinition,
  context: MapperContext,
): string | undefined {
  for (const each of sourceChain(definition, context.model, context.isExported)) {
    const description = descriptionOf(each, context);
    if (description !== undefined) return description;
  }
  return undefined;
}

/**
 * The description a concept shows: the definition's own or inherited one (inheritedDescription),
 * else, for a ".texts" entity CAP generated for localized elements, one built from its parent
 * entity (task 4.12), so apps with localized data don't get a W1 warning for every texts entity.
 */
export function describedOf(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
): string | undefined {
  return inheritedDescription(definition, context) ?? textsDescription(name, context);
}

// "shop.Genres.texts" is generated when shop.Genres has localized elements and a "texts"
// composition pointing at it. Without a localized element it is the app's own entity.
function textsDescription(name: string, context: MapperContext): string | undefined {
  const suffix = ".texts";
  if (!name.endsWith(suffix)) return undefined;
  const parentName = name.slice(0, -suffix.length);
  const parent = context.model.definitions[parentName];
  const texts = parent?.elements?.["texts"] as { target?: unknown } | undefined;
  if (parent === undefined || texts?.target !== name || !hasLocalizedElement(parent)) {
    return undefined;
  }
  return `Translated texts of ${titleOf(parentName, parent, context)}, one row per language.`;
}

function hasLocalizedElement(definition: CsnDefinition): boolean {
  const elements = Object.values(definition.elements ?? {}) as { localized?: unknown }[];
  return elements.some((element) => element.localized === true);
}

/** The definition's doc comment, else the first one down its source chain. */
export function inheritedDoc(
  definition: CsnDefinition,
  context: MapperContext,
): string | undefined {
  return sourceChain(definition, context.model, context.isExported).find(
    (each) => each.doc !== undefined,
  )?.doc;
}

/** A Markdown link to a definition's concept, with its title as the text. */
export function linkTo(name: string, context: MapperContext): string {
  const definition = context.model.definitions[name];
  const title = definition ? titleOf(name, definition, context) : shortName(name);
  return `[${escapeLinkText(escapeHtml(title))}](${conceptLinkFor(name)})`;
}

/** The frontmatter every generated concept starts with (spec §4.1). */
export function baseFrontmatter(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
  type: string,
): Frontmatter {
  const description = describedOf(name, definition, context);
  const namespace = namespaceOf(name);
  return {
    type,
    title: titleOf(name, definition, context),
    ...(description === undefined ? {} : { description }),
    resource: `cds:${name}`,
    tags: [
      ...new Set([
        "cds",
        type.toLowerCase(),
        ...(namespace === undefined ? [] : [namespace]),
        ...extraTags(definition),
      ]),
    ],
  };
}

// @okf.tags: one tag or a list, added after the generated ones (task 2.6); a tag already there
// isn't repeated, and anything that isn't text, or is empty, is skipped.
function extraTags(definition: CsnDefinition): string[] {
  const tags = definition["@okf.tags"];
  const list: unknown[] = Array.isArray(tags) ? tags : [tags];
  return list
    .filter((tag): tag is string => typeof tag === "string")
    .map(oneLine)
    .filter((tag) => tag !== "");
}
