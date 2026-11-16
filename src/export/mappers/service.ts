// Services: one concept per service, listing what it exposes as links. Its @requires is left out
// on purpose (ADR-0003); task 2.4 adds it inside the marked authorization section.
import { escapeBlock, escapeHtml, inlineCode, oneLine } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import type { Mapper, MapperContext } from "./context";
import { generatedConcept } from "./concept-builder";
import { inheritedDescription, linkTo, titleOf } from "./shared";

/**
 * The sections a service lists its members in, by CSN kind, in this order. A lookup table, so
 * adding a kind adds a row, never a branch. (Projections and views are kind "entity" in CSN.)
 */
const SECTIONS: readonly { heading: string; kind: string }[] = [
  { heading: "Entities", kind: "entity" },
  { heading: "Actions", kind: "action" },
  { heading: "Functions", kind: "function" },
  { heading: "Events", kind: "event" },
];

export const serviceMapper: Mapper = {
  kind: "service",
  map(name, definition, context) {
    const members = membersOf(name, context);
    const sections = [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...(definition.doc === undefined ? [] : [escapeBlock(definition.doc)]),
      ...pathSection(definition),
      ...SECTIONS.flatMap(({ heading, kind }) =>
        listSection(
          heading,
          members.filter((member) => member.definition.kind === kind),
          context,
        ),
      ),
    ];
    return generatedConcept(name, definition, context, "Service", sections);
  },
};

interface Member {
  name: string;
  definition: CsnDefinition;
}

/**
 * The service's own definitions, in the order they are declared. A definition inside another
 * one, such as "S.Books.texts" inside "S.Books", belongs to that one and is reached through its
 * associations; a dotted name such as "S.Dotted.Name" with no "S.Dotted" is the service's own.
 */
function membersOf(service: string, context: MapperContext): Member[] {
  const prefix = `${service}.`;
  return Object.entries(context.model.definitions)
    .filter(([name]) => name.startsWith(prefix) && !isInsideAnother(prefix, name, context))
    .map(([name, definition]) => ({ name, definition }));
}

// "S.Books.texts" with prefix "S.": is "S.Books" a definition?
function isInsideAnother(prefix: string, name: string, context: MapperContext): boolean {
  const segments = name.slice(prefix.length).split(".");
  return segments
    .slice(0, -1)
    .some((_, index) => context.model.definitions[prefix + segments.slice(0, index + 1).join(".")]);
}

// "Path: `/catalog`": where the service is served, when the model says so.
function pathSection(definition: CsnDefinition): string[] {
  const path = definition["@path"];
  return typeof path === "string" ? [`Path: ${inlineCode(oneLine(path))}`] : [];
}

// "- [Books](/model/CatalogService/Books.md) - Books in the catalog."
function listSection(heading: string, members: Member[], context: MapperContext): string[] {
  if (members.length === 0) return [];
  const lines = members.map(({ name, definition }) => {
    const description = inheritedDescription(definition, context);
    const link = `- ${linkTo(name, context)}`;
    return description === undefined ? link : `${link} - ${escapeHtml(description)}`;
  });
  return [[`## ${heading}`, "", ...lines].join("\n")];
}
