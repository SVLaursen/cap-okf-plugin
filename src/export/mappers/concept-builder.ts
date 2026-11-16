// Builds every generated concept, so all kinds share frontmatter, layout and the authorization
// section (ADR-0003), which comes last and can't be forgotten by any mapper.
import { conceptId, type Concept } from "../../core/concept";
import { authorizationSection } from "../auth-section";
import type { CsnDefinition } from "../csn";
import { conceptPathFor } from "../paths";
import type { MapperContext } from "./context";
import { baseFrontmatter } from "./shared";

/** A generated concept of OKF `type` for `name`, with its body made of Markdown sections. */
export function generatedConcept(
  name: string,
  definition: CsnDefinition,
  context: MapperContext,
  type: string,
  sections: string[],
): Concept {
  const path = conceptPathFor(name);
  const allSections = [...sections, ...authorizationSection(name, definition, context)];
  return {
    path,
    id: conceptId(path),
    frontmatter: baseFrontmatter(name, definition, context, type),
    // A blank line between the frontmatter and the first section, and one newline at the end.
    body: `\n${allSections.join("\n\n")}\n`,
  };
}
