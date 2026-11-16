// The mapper registry: one mapper per kind of definition (CLAUDE.md). A new kind gets its own
// module here; the exporter never branches on kinds itself.
import type { CsnDefinition } from "../csn";
import type { Mapper } from "./context";
import { entityMapper } from "./entity";

/** Every mapper, by the registry key of the definitions it handles (see registryKeyOf). */
export const MAPPERS: Readonly<Record<string, Mapper>> = {
  [entityMapper.kind]: entityMapper,
};

/**
 * The key a definition is looked up by: its CSN kind, except that projections and views, which
 * CSN also calls "entity", get "projection". This is the one place that tells them apart.
 */
export function registryKeyOf(definition: CsnDefinition): string {
  if (definition.projection !== undefined || definition.query !== undefined) return "projection";
  return definition.kind ?? "unknown";
}

/** The mapper for a registry key, or undefined when nothing exports that kind (yet). */
export function mapperFor(key: string): Mapper | undefined {
  return Object.hasOwn(MAPPERS, key) ? MAPPERS[key] : undefined;
}
