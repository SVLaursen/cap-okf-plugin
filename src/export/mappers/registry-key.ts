// How a definition is looked up in the mapper registry. A module of its own, so mappers that
// list other definitions (e.g. services) can use it without importing the registry itself.
import type { CsnDefinition } from "../csn";

/**
 * The key a definition is looked up by: its CSN kind, except that projections and views, which
 * CSN also calls "entity", get "projection". This is the one place that tells them apart.
 */
export function registryKeyOf(definition: CsnDefinition): string {
  if (definition.projection !== undefined || definition.query !== undefined) return "projection";
  return definition.kind ?? "unknown";
}
