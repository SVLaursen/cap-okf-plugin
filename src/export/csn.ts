// The parts of CAP's CSN (https://cap.cloud.sap/docs/cds/csn) that the mappers read.
// The mappers take CSN as plain data, not @sap/cds objects, so they can be tested with small
// literal models. The exporter passes the inferred model loaded with doc comments (ADR-0007).

/** A whole model: every definition by its fully qualified name. */
export interface Csn {
  definitions: Record<string, CsnDefinition>;
}

/** One definition, e.g. an entity, service, type or action. */
export interface CsnDefinition {
  kind?: string;
  /** The /** doc comment *\/, when the model was loaded with { docs: true }. */
  doc?: string;
  /** Aspects and entities it includes, e.g. ["cuid", "managed"]. */
  includes?: string[];
  elements?: Record<string, CsnElement>;
  /** Set on projections ("as projection on …"). */
  projection?: unknown;
  /** Set on views ("as select from …"). */
  query?: unknown;
  /** Annotations, e.g. "@title". */
  [annotation: `@${string}`]: unknown;
}

/** One element of an entity, type or aspect. */
export interface CsnElement {
  /** A type name, or a reference to another element's type ("type of Orders:status"). */
  type?: string | { ref: string[] };
  /** For arrayed elements ("many String"): the type of one item. */
  items?: CsnElement;
  key?: boolean;
  notNull?: boolean;
  localized?: boolean;
  virtual?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  default?: { val?: unknown };
  /** For associations and compositions: the target's fully qualified name. */
  target?: string;
  /** For associations and compositions; max "*" or above 1 means to many. */
  cardinality?: { max?: number | string };
  /** For managed associations: the target elements used as foreign keys. */
  keys?: unknown[];
  /** For unmanaged associations and compositions: the ON condition. */
  on?: unknown[];
  /** For a structured element without a named type: its own elements. */
  elements?: Record<string, CsnElement>;
  doc?: string;
  [annotation: `@${string}`]: unknown;
}
