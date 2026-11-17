import { MemoryBundleSource } from "../../src/bundle/source";
import { oneBundleForEveryKey } from "../../src/serve/bundles";
import {
  gavdiHints,
  instructionsText,
  noteText,
  type HintContext,
  type HintRegistry,
  type ToolTarget,
} from "../../src/serve/mcp/gavdi-hints";
import type { McpChoice } from "../../src/serve/mcp/select";
import type { ViewConcept } from "../../src/serve/reader-view";

// ADR-0013 (Contract C, client side): instructions and tool notes through @gavdi/cap-mcp's
// mcp:hints, against a fake emitter and registry.

const generated = (name: string) =>
  `---\ntype: Entity\ntitle: ${name}\nresource: cds:${name}\n---\n# ${name}\n`;

const BUNDLE = {
  "model/S/Orders.md": generated("S.Orders"),
  "model/S/cancel.md": generated("S.cancel"),
  "guides/kpis.md":
    "---\ntype: Guide\ntitle: Order KPIs\ndescription: How on-time delivery is measured.\n---\n[orders](/model/S/Orders.md)\n",
  "guides/cancel.md":
    "---\ntype: Rule\ntitle: Cancelling\ndescription: When an order may be cancelled.\n---\n[cancel](/model/S/cancel.md) [orders](/model/S/Orders.md)\n",
  "finance/margins.md":
    "---\ntype: Rule\ntitle: Margins\ndescription: Secret.\nrequires: finance\n---\n[orders](/model/S/Orders.md)\n",
};

const CHOICE: McpChoice = {
  plugin: "@gavdi/cap-mcp",
  as: ["resources", "tools"],
  namespace: "acme",
  requires: ["authenticated-user"],
  related: true,
  instructions: true,
  pointers: true,
};

const user = (...roles: string[]) => ({ is: (role: string) => roles.includes(role) });
const SIGNED_IN: HintContext = { user: user("authenticated-user") };
const FINANCE: HintContext = { user: user("authenticated-user", "finance") };
const ANONYMOUS: HintContext = { user: user() };

const target = (definition: string, kind: ToolTarget["kind"] = "entity"): ToolTarget => ({
  tool: `${definition.replace(/\./g, "_")}_query`,
  service: definition.split(".")[0]!,
  definition,
  kind,
});

function fakeCds() {
  const listeners = new Map<string, ((arg?: unknown) => void)[]>();
  return {
    on(event: string, listener: (...args: never[]) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener as (arg?: unknown) => void]);
    },
    emit(event: string, arg?: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(arg);
    },
  };
}

function served(choice: McpChoice = CHOICE, emit = true) {
  const cds = fakeCds();
  const debug: string[] = [];
  const hints = gavdiHints(cds, (message) => debug.push(message));
  hints.use({ choice, bundles: oneBundleForEveryKey(async () => new MemoryBundleSource(BUNDLE)) });
  const instructions: Parameters<HintRegistry["addInstructions"]>[0][] = [];
  const notes: Parameters<HintRegistry["addToolNotes"]>[0][] = [];
  const registry: HintRegistry = {
    contractVersion: 1,
    addInstructions: (provider) => void instructions.push(provider),
    addToolNotes: (provider) => void notes.push(provider),
  };
  if (emit) cds.emit("mcp:hints", registry);
  cds.emit("listening");
  return { instructions, notes, debug };
}

describe("gavdiHints: instructions", () => {
  test("the default names the knowledge and how to read it on both channels", async () => {
    const { instructions } = served();
    expect(instructions.map((each) => each.id)).toEqual(["cap-okf"]);
    const text = await instructions[0]!.text(SIGNED_IN);
    expect(text).toMatch(/^This app publishes its business knowledge as OKF notes/);
    expect(text).toContain("call OkfService_getIndex (or read the resource okf://acme/index.md)");
    expect(text!.length).toBeLessThanOrEqual(1500);
  });

  test("names only the channel that is on", () => {
    expect(instructionsText({ ...CHOICE, as: ["resources"] })).toContain(
      "read the resource okf://acme/index.md, then the notes it lists",
    );
    expect(instructionsText({ ...CHOICE, as: ["tools"] })).not.toContain("okf://");
  });

  test("the app's own text replaces the default; nothing for a caller without requires", async () => {
    const { instructions } = served({ ...CHOICE, instructions: "Read the OKF index first." });
    expect(await instructions[0]!.text(SIGNED_IN)).toBe("Read the OKF index first.");
    expect(await instructions[0]!.text(ANONYMOUS)).toBeUndefined();
  });
});

describe("gavdiHints: tool notes", () => {
  test("a tool whose definition a curated note links to gets one line from that note", async () => {
    const { notes } = served();
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).toBe(
      "Business knowledge: Cancelling (guides/cancel.md): When an order may be cancelled.; " +
        "Order KPIs (guides/kpis.md): How on-time delivery is measured.",
    );
  });

  test("notes the caller may not see are left out; the caller with the role gets them", async () => {
    const { notes } = served();
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).not.toContain("Margins");
    expect(await notes[0]!.note(target("S.Orders"), FINANCE)).toContain(
      "Margins (finance/margins.md): Secret.",
    );
    expect(await notes[0]!.note(target("S.Orders"), ANONYMOUS)).toBeUndefined();
  });

  test("most specific first: a bound action gets its own notes, then its entity's", async () => {
    const { notes } = served();
    const bound = await notes[0]!.note(target("S.Orders.cancel", "action"), SIGNED_IN);
    expect(bound).toBe(
      "Business knowledge: Cancelling (guides/cancel.md): When an order may be cancelled.; " +
        "Order KPIs (guides/kpis.md): How on-time delivery is measured.",
    );
    const unbound = await notes[0]!.note(target("S.cancel", "action"), SIGNED_IN);
    expect(unbound).toBe(
      "Business knowledge: Cancelling (guides/cancel.md): When an order may be cancelled.",
    );
  });

  test("nothing for OkfService's own tools or a definition no note links to", async () => {
    const { notes } = served();
    expect(await notes[0]!.note(target("OkfService.Index"), SIGNED_IN)).toBeUndefined();
    expect(await notes[0]!.note(target("S.Payments"), SIGNED_IN)).toBeUndefined();
  });
});

describe("gavdiHints: switches and the event", () => {
  test("instructions: false and pointers: false register nothing", () => {
    const { instructions, notes } = served({ ...CHOICE, instructions: false, pointers: false });
    expect({ instructions, notes }).toEqual({ instructions: [], notes: [] });
  });

  test("each switch on its own", () => {
    expect(served({ ...CHOICE, instructions: false }).notes).toHaveLength(1);
    expect(served({ ...CHOICE, pointers: false }).instructions).toHaveLength(1);
  });

  test("without the event: one debug line at listening, nothing else", () => {
    const { debug } = served(CHOICE, false);
    expect(debug).toEqual([
      "[okf] @gavdi/cap-mcp didn't emit mcp:hints, so no instructions or tool notes are added.",
    ]);
    expect(served().debug).toEqual([]);
  });
});

describe("noteText", () => {
  const note = (path: string, title: string, description?: string): ViewConcept => ({
    path,
    frontmatter: { title, ...(description && { description }) },
    body: "",
    curated: true,
  });

  test("stays within 400 characters: descriptions go before titles, the last first", () => {
    const long = "x".repeat(150);
    const text = noteText([
      note("a.md", "A", long),
      note("b.md", "B", long),
      note("c.md", "C", long),
    ]);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toBe(`Business knowledge: A (a.md): ${long}; B (b.md): ${long}; C (c.md)`);
  });

  test("then whole notes go, the most specific stays", () => {
    const many = Array.from({ length: 40 }, (_, i) => note(`n${i}.md`, `Note ${i}`, "d"));
    const text = noteText(many);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toMatch(/^Business knowledge: Note 0 \(n0\.md\); Note 1/);
  });
});
