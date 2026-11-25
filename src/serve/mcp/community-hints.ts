// Awareness through @gavdi/cap-mcp's mcp:hints event (ADR-0013, Contract C; their ADR 0014):
// agents use the app's knowledge only when something tells them it exists and when it applies.
// The two places every agent reads are the server's instructions and each tool's description.
// One signal is enough, so the cheap one is the default:
//
// - Instructions (cds.okf.serve.mcp.instructions, default on): a short text that ties reading
//   the index to need (a business term, a code, a named figure, an action; not a plain read of
//   one record), says the notes have gaps, and lists up to three pinned notes the caller sees.
//   false for none; or the app's own text, still followed by the pinned notes.
// - Tool notes (cds.okf.serve.mcp.pointers, default off, as they cost tokens on every request):
//   a tool whose CDS definition a curated note links to gets one line from the notes' titles and
//   paths ("short"), or with their descriptions too (true), e.g. "Business knowledge: Shipping
//   KPIs (guides/shipping-kpis.md): How on-time delivery is measured."
// - OkfService's own tools get the directive part of their description (tool-texts.ts) as a
//   note, unless it is already in the model (signals "always", or @cap-js/mcp).
//
// Everything answers per caller: nothing for a caller who doesn't meet `requires`, and only
// notes the caller may see (reader-view.ts). With signals "auto" (the default), a caller who
// sees no curated notes gets nothing at all: no instructions, no tool notes, and so the neutral
// tool descriptions. "Read this first" over generated concepts only makes agents spend calls on
// what the tools already say.
//
// The plugin is never required (ADR-0004): it is met through its event, and the shapes are
// declared here. Without the event (an older @gavdi/cap-mcp), one line at debug level, and
// everything else works as before.
import { isNonEmptyString } from "../../core/values";
import type { Bundles } from "../bundles";
import type { ReaderView, ViewConcept } from "../reader-view";
import { linkedConcepts } from "../related";
import { readerOf, viewOf } from "../views";
import { meetsRequires } from "./requires";
import type { McpChoice } from "./select";
import { OKF_SERVICE, directiveFor, directivesInModel } from "./tool-texts";

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
const MAX_NOTE = 400;
const MAX_INSTRUCTIONS = 1500;
const NOTE_PREFIX = "Business knowledge: ";
/** At most this many pinned notes are listed in the instructions. */
export const MAX_PINNED = 3;
const MAX_PINNED_ENTRY = 300;
const PINNED_HEADING = "Pinned notes, which always apply:";

/**
 * Subscribes to mcp:hints and listening at plugin load, as communityResources does. `use` hands it
 * what to serve at bootstrap, or undefined when this server serves nothing over MCP.
 */
export function communityHints(
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
    registry.addInstructions({ id: PROVIDER_ID, text: (ctx) => instructionsFor(setup, ctx) });
  }
  if (choice.pointers !== false || directivesAsNotes(choice)) {
    registry.addToolNotes({ id: PROVIDER_ID, note: (target, ctx) => noteFor(setup, target, ctx) });
  }
}

// OkfService's directive parts go out as notes when the tools channel is on and they aren't in
// the model already.
function directivesAsNotes(choice: McpChoice): boolean {
  return choice.as.includes("tools") && !directivesInModel(choice);
}

// The caller's view, or undefined when they get no signals: they don't meet `requires`, or
// (with signals "auto") they see no curated notes.
async function signalledView(
  { choice, bundles }: HintsSetup,
  ctx: HintContext,
): Promise<ReaderView | undefined> {
  if (!meetsRequires(ctx.user, choice.requires)) return undefined;
  const source = await bundles.forKey({ tenant: ctx.tenant, locale: ctx.locale });
  const view = await viewOf(source, readerOf(ctx.user));
  if (choice.signals === "auto" && !view.concepts.some((each) => each.curated)) return undefined;
  return view;
}

async function instructionsFor(setup: HintsSetup, ctx: HintContext): Promise<string | undefined> {
  const view = await signalledView(setup, ctx);
  if (view === undefined) return undefined;
  return withPinned(instructionsText(setup.choice), pinnedNotes(view));
}

/** The instructions: the app's own text, or the default for the channels that are on. */
export function instructionsText(choice: McpChoice): string {
  if (typeof choice.instructions === "string") return choice.instructions;
  const index = `okf://${choice.namespace}/index.md`;
  const tools = choice.as.includes("tools");
  const resources = choice.as.includes("resources");
  const where =
    tools && resources
      ? `${OKF_SERVICE}_getIndex or ${index}`
      : tools
        ? `${OKF_SERVICE}_getIndex`
        : index;
  return (
    "This app defines its business terms, codes, named figures and action rules in OKF notes. " +
    "When a request uses a business term, code or status value, named figure or KPI, time or " +
    `unit convention, or asks for an action, first read the index (${where}). A plain read of ` +
    "one record by key or name doesn't need it. The notes don't cover everything: if a term, " +
    "figure or rule you need isn't defined in them or in the data, say it isn't defined " +
    "instead of assuming one."
  );
}

/** The curated notes the view shows with `pinned: true`, in index (path) order, at most three. */
export function pinnedNotes(view: ReaderView): ViewConcept[] {
  return view.concepts.filter(isPinned).slice(0, MAX_PINNED);
}

/** Every pinned curated note in a view, for the startup warning about more than three. */
export function allPinnedNotes(view: ReaderView): ViewConcept[] {
  return view.concepts.filter(isPinned);
}

function isPinned(concept: ViewConcept): boolean {
  return concept.curated && concept.frontmatter["pinned"] === true;
}

/**
 * The instructions followed by the pinned notes, one line each with title, path and
 * description, within the contract's 1,500 characters: a long description is cut first, and a
 * note that doesn't fit is left out.
 */
export function withPinned(instructions: string, pinned: readonly ViewConcept[]): string {
  let text = instructions;
  for (const [index, note] of pinned.entries()) {
    const line = cut(`- ${entryOf(note, true)}`, MAX_PINNED_ENTRY);
    const next = index === 0 ? `${text}\n\n${PINNED_HEADING}\n${line}` : `${text}\n${line}`;
    if (Array.from(next).length > MAX_INSTRUCTIONS) break;
    text = next;
  }
  return text;
}

async function noteFor(
  setup: HintsSetup,
  target: ToolTarget,
  ctx: HintContext,
): Promise<string | undefined> {
  const view = await signalledView(setup, ctx);
  if (view === undefined) return undefined;
  const { choice } = setup;
  if (target.service === OKF_SERVICE) {
    return directivesAsNotes(choice) ? directiveFor(target.definition) : undefined;
  }
  if (choice.pointers === false) return undefined;
  const notes = notesFor(notesByDefinition(view), target);
  return notes.length === 0 ? undefined : noteText(notes, choice.pointers === "short");
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
 * too long, descriptions go first (the least specific note's first), then whole notes. `short`
 * leaves every description out: "Business knowledge: A (a.md); B (b.md)".
 */
export function noteText(notes: readonly ViewConcept[], short = false): string {
  const entries = notes.map((note) => ({
    title: titleOf(note),
    path: note.path,
    description: short ? undefined : descriptionOf(note),
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
  return cut(render(), MAX_NOTE);
}

// Counted in code points, as @gavdi/cap-mcp counts them, so a cut never splits a character.
function cut(text: string, max: number): string {
  const characters = Array.from(text);
  return characters.length > max
    ? `${characters.slice(0, max - 1).join("")}…`
    : characters.join("");
}

// "Title (path)", or with `withDescription` "Title (path): description" when it has one.
function entryOf(note: ViewConcept, withDescription: boolean): string {
  const description = withDescription ? descriptionOf(note) : undefined;
  const entry = `${titleOf(note)} (${note.path})`;
  return description === undefined ? entry : `${entry}: ${description}`;
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
