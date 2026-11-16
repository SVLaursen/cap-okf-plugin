// Events: their payload written like an entity's elements, as type Event. An event declared
// "as projection on …" names its source, like a projection.
import type { Mapper } from "./context";
import { entityConcept } from "./entity";
import { sourceLead } from "./projection";

export const eventMapper: Mapper = {
  kind: "event",
  map: (name, definition, context) =>
    entityConcept(name, definition, context, "Event", sourceLead(definition, context)),
};
