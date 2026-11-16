// The mapper registry: one mapper per kind of definition (CLAUDE.md). A new kind gets its own
// module here; the exporter never branches on kinds itself.
import type { CsnDefinition } from "../csn";
import { actionMapper, functionMapper } from "./action";
import { aspectMapper } from "./aspect";
import type { Mapper } from "./context";
import { entityMapper } from "./entity";
import { eventMapper } from "./event";
import { projectionMapper } from "./projection";
import { serviceMapper } from "./service";
import { typeMapper } from "./type";

/** Every mapper, by the registry key of the definitions it handles (see registryKeyOf). */
export const MAPPERS: Readonly<Record<string, Mapper>> = {
  [entityMapper.kind]: entityMapper,
  [projectionMapper.kind]: projectionMapper,
  [serviceMapper.kind]: serviceMapper,
  [actionMapper.kind]: actionMapper,
  [functionMapper.kind]: functionMapper,
  [typeMapper.kind]: typeMapper,
  [aspectMapper.kind]: aspectMapper,
  [eventMapper.kind]: eventMapper,
};

/**
 * The key a definition is looked up by: its CSN kind, except that entities which are projections
 * or views get "projection". Events and types can be projections too; they keep their own kind.
 */
export function registryKeyOf(definition: CsnDefinition): string {
  const isView = definition.projection !== undefined || definition.query !== undefined;
  if (definition.kind === "entity" && isView) return "projection";
  return definition.kind ?? "unknown";
}

/** The mapper for a registry key, or undefined when nothing exports that kind (yet). */
export function mapperFor(key: string): Mapper | undefined {
  return Object.hasOwn(MAPPERS, key) ? MAPPERS[key] : undefined;
}
