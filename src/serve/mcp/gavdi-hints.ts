// Awareness through @gavdi/cap-mcp's mcp:hints event (ADR-0013, Contract C; their ADR 0014):
// agents use the app's knowledge only when something tells them it exists and when it applies.
// The two places every agent reads are the server's instructions and each tool's description.
//
// - Instructions (cds.okf.serve.mcp.instructions): a short default that says the app publishes
//   its business knowledge and how to read it on the channels that are on; false for none; or
//   the app's own text.
// - Tool notes (cds.okf.serve.mcp.pointers): a tool whose CDS definition a curated note links to
//   gets one line built only from that note's title, path and description, e.g.
//   "Business knowledge: Shipping KPIs (guides/shipping-kpis.md): How on-time delivery is
//   measured." Never for OkfService's own tools.
// Both answer per caller: nothing for a caller who doesn't meet `requires`, and only notes the
// caller may see (reader-view.ts). The plugin is never required (ADR-0004): it is met through
// its event, and the shapes are declared here. Without the event (an older @gavdi/cap-mcp), one
// line at debug level, and everything else works as before.
import { isNonEmptyString } from "../../core/values";
import type { Bundles } from "../bundles";
import type { ReaderView, ViewConcept } from "../reader-view";
import { linkedConcepts } from "../related";
import { readerOf, viewOf } from "../views";
import { meetsRequires } from "./requires";
import type { McpChoice } from "./select";

/** Who is asking: from the request's cds.context. */
export interface HintContext {
  user: unknown;
  tenant?: string;
  locale?: string;
}

/** The tool a note is asked for. */
export interface ToolTarget {
  tool: string;
  service: string;
  definition: string;
  kind: "entity" | "action" | "function";
}

/** What the mcp:hints event hands to listeners (contract version 1). */
export interface HintRegistry {
  readonly contractVersion: number;
  addInstructions(provider: {
    id: string;
    text(ctx: HintContext): string | undefined | Promise<string | undefined>;
  }): void;
  addToolNotes(provider: {
    id: string;
    note(target: ToolTarget, ctx: HintContext): string | undefined | Promise<string | undefined>;
  }): void;
}

interface Events {
  on(event: string, listener: (...args: never[]) => void): unknown;
}

/** What the hints serve: decided at bootstrap. */
export interface HintsSetup {
  choice: McpChoice;
  bundles: Bundles;
}

const EVENT = "mcp:hints";
const PROVIDER_ID = "cap-okf";
const OWN_SERVICE = "OkfService";
const MAX_NOTE = 400;
const NOTE_PREFIX = "Business knowledge: ";

/**
 * Subscribes to mcp:hints and listening at plugin load, as gavdiResources does. `use` hands it
 * what to serve at bootstrap, or undefined when this server serves nothing over MCP.
 */
export function gavdiHints(
  cds: Events,
  debug: (message: string) => void,
): { use(setup: HintsSetup | undefined): void } {
  let setup: HintsSetup | undefined;
  let arrived = false;
  cds.on(EVENT, (registry: HintRegistry) => {
    arrived = true;
    if (setup !== undefined) registerHints(registry, setup);
  });
  cds.on("listening", () => {
    if (setup !== undefined && !arrived) {
      debug(
        `[okf] @gavdi/cap-mcp didn't emit ${EVENT}, so no instructions or tool notes are added.`,
      );
    }
  });
  return {
    use(next) {
      setup = next;
      arrived = false;
    },
  };
}

// Synchronously, while the event runs: the registry closes when the emit returns.
function registerHints(registry: HintRegistry, setup: HintsSetup): void {
  const { choice } = setup;
  if (choice.instructions !== false) {
    const text = instructionsText(choice);
    registry.addInstructions({
      id: PROVIDER_ID,
      text: (ctx) => (meetsRequires(ctx.user, choice.requires) ? text : undefined),
    });
  }
  if (choice.pointers) {
    registry.addToolNotes({ id: PROVIDER_ID, note: (target, ctx) => noteFor(setup, target, ctx) });
  }
}

/** The instructions: the app's own text, or the default for the channels that are on. */
export function instructionsText(choice: McpChoice): string {
  if (typeof choice.instructions === "string") return choice.instructions;
  const index = `okf://${choice.namespace}/index.md`;
  const tools = choice.as.includes("tools");
  const resources = choice.as.includes("resources");
  const how =
    tools && resources
      ? `call ${OWN_SERVICE}_getIndex (or read the resource ${index}), then read the notes you need with ${OWN_SERVICE}_getConcept`
      : tools
        ? `call ${OWN_SERVICE}_getIndex, then read the notes you need with ${OWN_SERVICE}_getConcept`
        : `read the resource ${index}, then the notes it lists`;
  return (
    "This app publishes its business knowledge as OKF notes: what business terms and codes " +
    "mean, how figures and KPIs are calculated, and the rules and preconditions of its " +
    "actions. Before you answer a question that uses a business term or code, or call an " +
    `action, read the index: ${how}.`
  );
}

async function noteFor(
  { choice, bundles }: HintsSetup,
  target: ToolTarget,
  ctx: HintContext,
): Promise<string | undefined> {
  if (target.service === OWN_SERVICE || !meetsRequires(ctx.user, choice.requires)) return undefined;
  const source = await bundles.forKey({ tenant: ctx.tenant, locale: ctx.locale });
  const notes = notesFor(notesByDefinition(await viewOf(source, readerOf(ctx.user))), target);
  return notes.length === 0 ? undefined : noteText(notes);
}

// Most specific first: notes linking to the definition itself, then, for a bound action or
// function (Service.Entity.op), notes linking to its entity, where it is described.
function notesFor(byDefinition: Map<string, ViewConcept[]>, target: ToolTarget): ViewConcept[] {
  const own = byDefinition.get(target.definition) ?? [];
  // Bound: Service.Entity.op. An unbound one (Service.op) has no "." after the service name,
  // however many dots the service name itself has (my.ns.Service.op).
  const inService = target.definition.startsWith(`${target.service}.`)
    ? target.definition.slice(target.service.length + 1)
    : "";
  const isBound = target.kind !== "entity" && inService.includes(".");
  const parent = target.definition.slice(0, target.definition.lastIndexOf("."));
  const inherited = isBound ? (byDefinition.get(parent) ?? []) : [];
  return [...own, ...inherited.filter((note) => !own.includes(note))];
}

// CDS definition → the curated notes the reader sees that link to its concept, in path order.
// Built once per view: the view is the same object for every reader with the same roles.
const indexes = new WeakMap<ReaderView, Map<string, ViewConcept[]>>();
function notesByDefinition(view: ReaderView): Map<string, ViewConcept[]> {
  let byDefinition = indexes.get(view);
  if (byDefinition === undefined) {
    byDefinition = buildNotesByDefinition(view);
    indexes.set(view, byDefinition);
  }
  return byDefinition;
}

function buildNotesByDefinition(view: ReaderView): Map<string, ViewConcept[]> {
  const byDefinition = new Map<string, ViewConcept[]>();
  for (const note of view.concepts.filter((each) => each.curated)) {
    for (const linked of linkedConcepts(view, note)) {
      const definition = definitionOf(linked);
      if (definition === undefined) continue;
      const notes = byDefinition.get(definition) ?? [];
      if (!notes.includes(note)) byDefinition.set(definition, [...notes, note]);
    }
  }
  return byDefinition;
}

// The CDS definition a generated concept describes, from its resource: cds:<name>.
function definitionOf(concept: ViewConcept): string | undefined {
  const resource = concept.frontmatter["resource"];
  if (concept.curated || !isNonEmptyString(resource) || !resource.startsWith("cds:")) {
    return undefined;
  }
  return resource.slice("cds:".length);
}

/**
 * "Business knowledge: A (a.md): about a; B (b.md): about b", within 400 characters: when it is
 * too long, descriptions go first (the least specific note's first), then whole notes.
 */
export function noteText(notes: readonly ViewConcept[]): string {
  const entries = notes.map((note) => ({
    title: titleOf(note),
    path: note.path,
    description: descriptionOf(note),
  }));
  const render = () =>
    NOTE_PREFIX +
    entries
      .map(({ title, path, description }) =>
        description === undefined ? `${title} (${path})` : `${title} (${path}): ${description}`,
      )
      .join("; ");
  for (
    let index = entries.length - 1;
    index >= 0 && Array.from(render()).length > MAX_NOTE;
    index -= 1
  ) {
    entries[index]!.description = undefined;
  }
  while (entries.length > 1 && Array.from(render()).length > MAX_NOTE) entries.pop();
  // Counted in code points, as @gavdi/cap-mcp counts them, so a cut never splits a character.
  const characters = Array.from(render());
  return characters.length > MAX_NOTE
    ? `${characters.slice(0, MAX_NOTE - 1).join("")}…`
    : characters.join("");
}

function titleOf(note: ViewConcept): string {
  const title = note.frontmatter["title"];
  return isNonEmptyString(title) ? oneLine(title) : note.path.slice(note.path.lastIndexOf("/") + 1);
}

function descriptionOf(note: ViewConcept): string | undefined {
  const description = note.frontmatter["description"];
  return isNonEmptyString(description) ? oneLine(description) : undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
