import { MemoryBundleSource } from "../../src/bundle/source";
import { oneBundleForEveryKey } from "../../src/serve/bundles";
import { warnAboutPinned } from "../../src/serve/serving";
import {
  communityHints,
  instructionsText,
  noteText,
  type HintContext,
  type HintRegistry,
  type ToolTarget,
} from "../../src/serve/mcp/community-hints";
import { selectMcp, type McpChoice } from "../../src/serve/mcp/select";
import { directiveFor } from "../../src/serve/mcp/tool-texts";
import type { ViewConcept } from "../../src/serve/reader-view";

// ADR-0013 (Contract C, client side): instructions and tool notes through @gavdi/cap-mcp's
// mcp:hints, against a fake emitter and registry. Round 2: tool notes are opt-in, every signal
// depends on the caller seeing curated notes, the instructions are conditional and list pinned
// notes.

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
    "---\ntype: Rule\ntitle: Margins\ndescription: Secret.\nrequires: finance\npinned: true\n---\n[orders](/model/S/Orders.md)\n",
  "guides/visibility.md":
    "---\ntype: Rule\ntitle: Who sees what\ndescription: Buyers see their own orders only.\npinned: true\n---\nText.\n",
};

const CHOICE: McpChoice = {
  plugin: "@gavdi/cap-mcp",
  as: ["resources", "tools"],
  namespace: "acme",
  requires: ["authenticated-user"],
  related: true,
  instructions: true,
  pointers: true,
  signals: "auto",
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

function served(choice: McpChoice = CHOICE, emit = true, files: Record<string, string> = BUNDLE) {
  const cds = fakeCds();
  const debug: string[] = [];
  const hints = communityHints(cds, (message) => debug.push(message));
  hints.use({ choice, bundles: oneBundleForEveryKey(async () => new MemoryBundleSource(files)) });
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

describe("communityHints: instructions", () => {
  test("conditional: read the index when the request needs it, not for a plain read", async () => {
    const { instructions } = served();
    expect(instructions.map((each) => each.id)).toEqual(["cap-okf"]);
    const text = (await instructions[0]!.text(SIGNED_IN))!;
    expect(text).toContain("When a request uses a business term, code or status value");
    expect(text).toContain("first read the index (OkfService_getIndex or okf://acme/index.md)");
    expect(text).toContain("A plain read of one record by key or name doesn't need it.");
  });

  test("says the notes have gaps", () => {
    expect(instructionsText(CHOICE)).toContain(
      "The notes don't cover everything: if a term, figure or rule you need isn't defined in them or in the data, say it isn't defined instead of assuming one.",
    );
  });

  test("the default stays under 500 characters", () => {
    expect(instructionsText(CHOICE).length).toBeLessThan(500);
  });

  test("names only the channel that is on", () => {
    expect(instructionsText({ ...CHOICE, as: ["resources"] })).toContain(
      "first read the index (okf://acme/index.md)",
    );
    expect(instructionsText({ ...CHOICE, as: ["tools"] })).not.toContain("okf://");
  });

  test("the app's own text replaces the default; nothing for a caller without requires", async () => {
    const files = { "guides/kpis.md": BUNDLE["guides/kpis.md"] };
    const own = { ...CHOICE, instructions: "Read the OKF index first." };
    const { instructions } = served(own, true, files);
    expect(await instructions[0]!.text(SIGNED_IN)).toBe("Read the OKF index first.");
    expect(await instructions[0]!.text(ANONYMOUS)).toBeUndefined();
  });
});

describe("communityHints: pinned notes", () => {
  test("listed at the end of the instructions, with title, path and description", async () => {
    const text = (await served().instructions[0]!.text(SIGNED_IN))!;
    expect(text).toMatch(
      /\n\nPinned notes, which always apply:\n- Who sees what \(guides\/visibility\.md\): Buyers see their own orders only\.$/,
    );
  });

  test("filtered by requires: the pinned note with a role only for those who have it", async () => {
    const { instructions } = served();
    expect(await instructions[0]!.text(SIGNED_IN)).not.toContain("Margins");
    expect(await instructions[0]!.text(FINANCE)).toContain(
      "Pinned notes, which always apply:\n- Margins (finance/margins.md): Secret.\n- Who sees what",
    );
  });

  test("at most three, in index order", async () => {
    const files: Record<string, string> = {};
    // Titles in the reverse order of the paths: the order is the index's (path) order.
    for (const [name, title] of [
      ["a", "Z"],
      ["b", "Y"],
      ["c", "X"],
      ["d", "W"],
      ["e", "V"],
    ]) {
      files[`pins/${name}.md`] = `---\ntype: Rule\ntitle: ${title}\npinned: true\n---\n`;
    }
    const text = (await served(CHOICE, true, files).instructions[0]!.text(SIGNED_IN))!;
    expect(text.split("Pinned notes, which always apply:\n")[1]).toBe(
      "- Z (pins/a.md)\n- Y (pins/b.md)\n- X (pins/c.md)",
    );
  });

  test("a long description is cut, and the text stays within the contract's 1,500", async () => {
    const files: Record<string, string> = {};
    for (const name of ["a", "b", "c"]) {
      files[`pins/${name}.md`] =
        `---\ntype: Rule\ntitle: ${name}\ndescription: ${"x".repeat(900)}\npinned: true\n---\n`;
    }
    const text = (await served(CHOICE, true, files).instructions[0]!.text(SIGNED_IN))!;
    expect(Array.from(text).length).toBeLessThanOrEqual(1500);
    expect(text).toContain("- c (pins/c.md): xxx");
  });
});

describe("communityHints: pinned notes, limits", () => {
  test("a pinned note that doesn't fit within 1,500 is left out, never cut off", async () => {
    const files: Record<string, string> = {};
    for (const name of ["a", "b", "c"]) {
      files[`pins/${name}.md`] =
        `---\ntype: Rule\ntitle: ${name}\ndescription: ${"x".repeat(900)}\npinned: true\n---\n`;
    }
    const long = { ...CHOICE, instructions: "Read the index. ".repeat(60).trim() };
    const text = (await served(long, true, files).instructions[0]!.text(SIGNED_IN))!;
    expect(Array.from(text).length).toBeLessThanOrEqual(1500);
    expect(text).toContain("- a (pins/a.md): xxx");
    expect(text).not.toContain("pins/c.md");
    // Each listed line is cut at 300 on its own; the last one listed is whole.
    expect(text.endsWith("…")).toBe(true);
  });

  test("pinned: true only; other values don't pin", async () => {
    const files = {
      "a.md": "---\ntype: Rule\ntitle: A\npinned: yes please\n---\n",
      "b.md": "---\ntype: Rule\ntitle: B\npinned: false\n---\n",
    };
    const text = await served(CHOICE, true, files).instructions[0]!.text(SIGNED_IN);
    expect(text).not.toContain("Pinned notes");
  });
});

describe("warnAboutPinned (startup)", () => {
  const pins = (count: number, extra = "") => {
    const files: Record<string, string> = {};
    for (let index = 1; index <= count; index += 1) {
      files[`pins/p${index}.md`] = `---\ntype: Rule\ntitle: P${index}\npinned: true\n${extra}---\n`;
    }
    return files;
  };
  const warningsFor = async (files: Record<string, string>) => {
    const warnings: string[] = [];
    const bundles = oneBundleForEveryKey(async () => new MemoryBundleSource(files));
    await warnAboutPinned(bundles, (message) => warnings.push(message));
    return warnings;
  };

  test("more than three pinned notes: one warning naming the three that are listed", async () => {
    expect(await warningsFor(pins(4))).toEqual([
      "[okf] okf/ — 4 notes are pinned, so the server instructions list only the first 3: pins/p1.md, pins/p2.md, pins/p3.md.\n" +
        "  Pin at most 3 notes: set pinned: true only where a note must reach every agent.",
    ]);
  });

  test("three or fewer: none; notes behind a role count too", async () => {
    expect(await warningsFor(pins(3))).toEqual([]);
    expect(await warningsFor(pins(4, "requires: finance\n"))).toHaveLength(1);
  });
});

describe("communityHints: no curated notes, no signals", () => {
  const generatedOnly = {
    "model/S/Orders.md": generated("S.Orders"),
    "model/S/cancel.md": generated("S.cancel"),
  };

  test("a bundle without curated notes: no instructions, no tool notes, neutral OkfService tools", async () => {
    const { instructions, notes } = served(CHOICE, true, generatedOnly);
    expect(await instructions[0]!.text(SIGNED_IN)).toBeUndefined();
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).toBeUndefined();
    const getIndex = { ...target("OkfService.getIndex", "function"), service: "OkfService" };
    expect(await notes[0]!.note(getIndex, SIGNED_IN)).toBeUndefined();
  });

  test("a user whose roles leave no curated note gets nothing; one who sees a note does", async () => {
    const files = { ...generatedOnly, "finance/margins.md": BUNDLE["finance/margins.md"] };
    const { instructions, notes } = served(CHOICE, true, files);
    const getIndex = { ...target("OkfService.getIndex", "function"), service: "OkfService" };
    expect(await instructions[0]!.text(SIGNED_IN)).toBeUndefined();
    expect(await notes[0]!.note(getIndex, SIGNED_IN)).toBeUndefined();
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).toBeUndefined();
    expect(await instructions[0]!.text(FINANCE)).toContain("first read the index");
    expect(await notes[0]!.note(getIndex, FINANCE)).toBe(directiveFor("OkfService.getIndex"));
  });

  test('signals: "always" gives the instructions anyway', async () => {
    const always = { ...CHOICE, signals: "always" as const };
    const { instructions } = served(always, true, generatedOnly);
    expect(await instructions[0]!.text(SIGNED_IN)).toContain("first read the index");
  });
});

describe("communityHints: OkfService's own tools", () => {
  const own = (name: string) => ({
    ...target(`OkfService.${name}`, "function"),
    service: "OkfService",
  });

  test("get the directive part of their description as a note, when signals are on", async () => {
    const { notes } = served({ ...CHOICE, pointers: false });
    for (const name of ["getIndex", "getConcept", "searchConcepts"]) {
      expect(await notes[0]!.note(own(name), SIGNED_IN)).toBe(directiveFor(`OkfService.${name}`));
    }
  });

  test('not when the directive is in the model already (signals "always"), or without tools', async () => {
    const always = served({ ...CHOICE, signals: "always", pointers: false });
    expect(always.notes).toEqual([]);
    const resources = served({ ...CHOICE, as: ["resources"], pointers: false });
    expect(resources.notes).toEqual([]);
  });

  test("the directive is tied to need and says the notes have gaps", () => {
    const getIndex = directiveFor("OkfService.getIndex")!;
    expect(getIndex).toContain("not for a plain read of one record by key");
    expect(getIndex).toContain("Notes have gaps");
    expect(directiveFor("OkfService.getConcept")).toContain("read them all in your next call");
  });
});

describe("communityHints: tool notes", () => {
  test("off by default: with serve.mcp on, instructions are registered, app tools get no note", async () => {
    const choice = selectMcp({
      okf: { serve: { mcp: true } },
      installed: ["@gavdi/cap-mcp"],
      packageName: "acme",
    }).choice!;
    expect(choice.pointers).toBe(false);
    const { instructions, notes } = served(choice);
    expect(instructions).toHaveLength(1);
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).toBeUndefined();
  });
});

describe("communityHints: tool notes, the forms", () => {
  test('"short": titles and paths only', async () => {
    const { notes } = served({ ...CHOICE, pointers: "short" });
    expect(await notes[0]!.note(target("S.Orders"), SIGNED_IN)).toBe(
      "Business knowledge: Cancelling (guides/cancel.md); Order KPIs (guides/kpis.md)",
    );
  });

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

describe("communityHints: namespaced services", () => {
  test("an unbound action of a namespaced service doesn't take the service's notes (review)", async () => {
    const files = {
      "model/my/ns/S.md": generated("my.ns.S"),
      "guides/s.md": "---\ntype: Guide\ntitle: About S\n---\n[service](/model/my/ns/S.md)\n",
    };
    const cds = fakeCds();
    const hints = communityHints(cds, () => undefined);
    hints.use({
      choice: CHOICE,
      bundles: oneBundleForEveryKey(async () => new MemoryBundleSource(files)),
    });
    const notes: Parameters<HintRegistry["addToolNotes"]>[0][] = [];
    cds.emit("mcp:hints", {
      contractVersion: 1,
      addInstructions: () => undefined,
      addToolNotes: (provider: (typeof notes)[number]) => void notes.push(provider),
    });
    const act: ToolTarget = {
      tool: "my_ns_S_act",
      service: "my.ns.S",
      definition: "my.ns.S.act",
      kind: "action",
    };
    expect(await notes[0]!.note(act, SIGNED_IN)).toBeUndefined();
  });
});

describe("communityHints: switches and the event", () => {
  test("instructions: false and pointers: false register nothing beyond OkfService's notes", () => {
    const off = { ...CHOICE, instructions: false, pointers: false } as const;
    expect(served(off).instructions).toEqual([]);
    const { instructions, notes } = served({ ...off, as: ["resources"] });
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

  test("a cut never splits a character", () => {
    const text = noteText([note("a.md", "😀".repeat(500))]);
    expect(Array.from(text)).toHaveLength(400);
    expect(text.endsWith("😀…")).toBe(true);
  });

  test("short leaves every description out", () => {
    expect(noteText([note("a.md", "A", "about a"), note("b.md", "B")], true)).toBe(
      "Business knowledge: A (a.md); B (b.md)",
    );
  });

  test("then whole notes go, the most specific stays", () => {
    const many = Array.from({ length: 40 }, (_, i) => note(`n${i}.md`, `Note ${i}`, "d"));
    const text = noteText(many);
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toMatch(/^Business knowledge: Note 0 \(n0\.md\); Note 1/);
  });
});
