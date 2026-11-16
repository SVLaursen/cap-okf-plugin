// Services: one concept per service, listing what it exposes as links. Its @requires is left out
// on purpose (ADR-0003); task 2.4 adds it inside the marked authorization section.
import { escapeHtml, escapeLinkText, inlineCode, oneLine } from "../../core/markdown";
import type { CsnDefinition } from "../csn";
import { conceptLinkFor } from "../paths";
import type { Mapper, MapperContext } from "./context";
import { descriptionOrSources } from "./projection";
import { registryKeyOf } from "./registry-key";
import { baseFrontmatter, generatedConcept, titleOf } from "./shared";

/**
 * The sections a service lists its members in, by registry key, in this order. A lookup table,
 * so adding a kind adds a row, never a branch.
 */
const SECTIONS: readonly { heading: string; keys: readonly string[] }[] = [
  { heading: "Entities", keys: ["entity", "projection"] },
  { heading: "Actions", keys: ["action"] },
  { heading: "Functions", keys: ["function"] },
  { heading: "Events", keys: ["event"] },
];

export const serviceMapper: Mapper = {
  kind: "service",
  map(name, definition, context) {
    const members = membersOf(name, context);
    const sections = [
      `# ${escapeHtml(titleOf(name, definition, context))}`,
      ...(definition.doc === undefined ? [] : [escapeHtml(definition.doc)]),
      ...pathSection(definition),
      ...SECTIONS.flatMap(({ heading, keys }) =>
        listSection(
          heading,
          members.filter((member) => keys.includes(member.key)),
          context,
        ),
      ),
    ];
    return generatedConcept(name, baseFrontmatter(name, definition, context, "Service"), sections);
  },
};

interface Member {
  name: string;
  definition: CsnDefinition;
  /** The registry key, e.g. "entity" or "projection". */
  key: string;
}

// The service's own definitions: "CatalogService.Books", but not "CatalogService.Books.texts",
// which belongs to Books. In the order they are declared.
function membersOf(service: string, context: MapperContext): Member[] {
  const prefix = `${service}.`;
  return Object.entries(context.model.definitions)
    .filter(([name]) => name.startsWith(prefix) && !name.slice(prefix.length).includes("."))
    .map(([name, definition]) => ({ name, definition, key: registryKeyOf(definition) }));
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
    const title = escapeLinkText(escapeHtml(titleOf(name, definition, context)));
    const description = descriptionOrSources(definition, context);
    const link = `- [${title}](${conceptLinkFor(name)})`;
    return description === undefined ? link : `${link} - ${escapeHtml(description)}`;
  });
  return [[`## ${heading}`, "", ...lines].join("\n")];
}
