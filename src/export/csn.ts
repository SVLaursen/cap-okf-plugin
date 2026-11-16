// The parts of CAP's CSN (https://cap.cloud.sap/docs/cds/csn) that the mappers read.
// The mappers take CSN as plain data, not @sap/cds objects, so they can be tested with small
// literal models. The exporter passes the inferred model loaded with doc comments (ADR-0007).

/** A whole model: every definition by its fully qualified name. */
export interface Csn {
  definitions: Record<string, CsnDefinition>;
}

/** Enum values by name; `val` is the stored value when it differs from the name. */
export type CsnEnum = Record<string, { val?: unknown }>;

/**
 * Anything that has a type: an element, a parameter, a return value, or a type definition.
 * The type is a name, a reference ("type of Orders:status"), "many" items, or own elements.
 */
export interface CsnTyped {
  type?: string | { ref: string[] };
  /** For arrayed types ("many String"): the type of one item. */
  items?: CsnTyped;
  /** For a structure without a named type: its own elements. */
  elements?: Record<string, CsnElement>;
  length?: number;
  precision?: number;
  scale?: number;
  enum?: CsnEnum;
  /** For associations and compositions: the target's fully qualified name. */
  target?: string;
  /** For a composition of an aspect: the aspect's name, or its inline elements. */
  targetAspect?: string | { elements?: Record<string, CsnElement> };
  /** For associations and compositions; max "*" or above 1 means to many. */
  cardinality?: { max?: number | string };
  doc?: string;
  [annotation: `@${string}`]: unknown;
}

/** One definition, e.g. an entity, service, type, aspect, event, action or function. */
export interface CsnDefinition extends CsnTyped {
  kind?: string;
  /** Aspects and entities it includes, e.g. ["cuid", "managed"]. */
  includes?: string[];
  /** Set on projections ("as projection on …"); from.ref[0] names the source. */
  projection?: { from?: CsnSource };
  /** Set on views ("as select from …"); SELECT.from.ref[0] names the source, unless it's a join. */
  query?: { SELECT?: { from?: CsnSource } };
  /** For actions and functions: their parameters, and what they return. */
  params?: Record<string, CsnElement>;
  returns?: CsnTyped;
  /** For entities: the actions and functions bound to them, by name. */
  actions?: Record<string, CsnDefinition>;
}

/** Where a projection or view selects from: a reference to one definition, or a join. */
export interface CsnSource {
  /** Names: "db.Books", or { id: "db.Books", where: … } with a filter; more for a path. */
  ref?: unknown[];
  /** For a join: the kind of join and the sources it joins. */
  join?: string;
  args?: unknown[];
}

/** One element of an entity, type or aspect, or one parameter. */
export interface CsnElement extends CsnTyped {
  key?: boolean;
  notNull?: boolean;
  localized?: boolean;
  virtual?: boolean;
  default?: { val?: unknown };
  /** For managed associations: the target elements used as foreign keys. */
  keys?: unknown[];
  /** For unmanaged associations and compositions: the ON condition. */
  on?: unknown[];
}
