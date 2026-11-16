// Aspects: written like entities (elements, associations, bound actions), as type Aspect.
import type { Mapper } from "./context";
import { entityConcept } from "./entity";

export const aspectMapper: Mapper = {
  kind: "aspect",
  map: (name, definition, context) => entityConcept(name, definition, context, "Aspect"),
};
