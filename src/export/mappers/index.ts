// The mapper registry: one mapper per kind of definition (CLAUDE.md). A new kind gets its own
// module here; the exporter never branches on kinds itself.
import type { Mapper } from "./context";
import { entityMapper } from "./entity";
import { projectionMapper } from "./projection";
import { serviceMapper } from "./service";

export { registryKeyOf } from "./registry-key";

/** Every mapper, by the registry key of the definitions it handles (see registryKeyOf). */
export const MAPPERS: Readonly<Record<string, Mapper>> = {
  [entityMapper.kind]: entityMapper,
  [projectionMapper.kind]: projectionMapper,
  [serviceMapper.kind]: serviceMapper,
};

/** The mapper for a registry key, or undefined when nothing exports that kind (yet). */
export function mapperFor(key: string): Mapper | undefined {
  return Object.hasOwn(MAPPERS, key) ? MAPPERS[key] : undefined;
}
