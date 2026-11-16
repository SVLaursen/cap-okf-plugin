// The mapper registry: one mapper per CSN kind (CLAUDE.md). A new kind gets its own module
// here; the exporter never branches on kinds itself.
import type { Mapper } from "./context";
import { entityMapper } from "./entity";

/** Every mapper, by the CSN kind it handles. */
export const MAPPERS: Readonly<Record<string, Mapper>> = {
  [entityMapper.kind]: entityMapper,
};

/** The mapper for a CSN kind, or undefined when that kind isn't exported. */
export function mapperFor(kind: string): Mapper | undefined {
  return Object.hasOwn(MAPPERS, kind) ? MAPPERS[kind] : undefined;
}
