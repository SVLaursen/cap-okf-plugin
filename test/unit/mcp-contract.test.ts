import { MemoryBundleSource } from "../../src/bundle/source";
import { oneBundleForEveryKey } from "../../src/serve/bundles";
import { communityResources } from "../../src/serve/mcp/community-cap-mcp";
import { communityHints } from "../../src/serve/mcp/community-hints";
import type { McpChoice } from "../../src/serve/mcp/select";
import { servedSkills } from "../../src/serve/mcp/skills";

// Task dr.1 (ADR-0014): the contract shapes from @gavdi/cap-mcp 2.0 and the guards around them.
// - ctx.skills (their ADR 0017) may be missing (an older release) or malformed: that is "none".
// - Both listeners register only for contract version 1; anything else gets one warning.

const user = { is: () => true };

describe("servedSkills: the skills in a hint context", () => {
  test("no skills when the context has none, as from an older @gavdi/cap-mcp", () => {
    expect(servedSkills({ user })).toEqual([]);
  });

  test("no skills for an empty list, or for something that isn't a list", () => {
    expect(servedSkills({ user, skills: [] })).toEqual([]);
    expect(servedSkills({ user, skills: "ship-order" })).toEqual([]);
    expect(servedSkills({ user, skills: { name: "ship-order" } })).toEqual([]);
    expect(servedSkills({ user, skills: null })).toEqual([]);
  });

  test("keeps well-formed entries in the order given", () => {
    const skills = [
      { uri: "skill://a/SKILL.md", name: "a", description: "Does a." },
      { uri: "skill://b/SKILL.md", name: "b", description: "Does b." },
    ];
    expect(servedSkills({ user, skills })).toEqual(skills);
  });

  test("leaves out entries without a text name or uri", () => {
    const skills = [
      { uri: "skill://a/SKILL.md", name: "a", description: "Does a." },
      { uri: "skill://b/SKILL.md", description: "No name." },
      { uri: "skill://c/SKILL.md", name: "", description: "Empty name." },
      { uri: "skill://d/SKILL.md", name: 4, description: "Not text." },
      { name: "e", description: "No uri." },
      { uri: "", name: "f", description: "Empty uri." },
      { uri: "skill://h/SKILL.md", name: "  ", description: "Only spaces." },
      null,
      "skill://g/SKILL.md",
    ];
    expect(servedSkills({ user, skills }).map((skill) => skill.name)).toEqual(["a"]);
  });

  test("a description that isn't text counts as empty", () => {
    const skills = [{ uri: "skill://a/SKILL.md", name: "a", description: 7 }];
    expect(servedSkills({ user, skills })).toEqual([
      { uri: "skill://a/SKILL.md", name: "a", description: "" },
    ]);
  });
});

const CHOICE: McpChoice = {
  plugin: "@gavdi/cap-mcp",
  as: ["resources", "tools"],
  namespace: "acme",
  requires: ["authenticated-user"],
  related: true,
  instructions: true,
  pointers: true,
  signals: "always",
};

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

const bundles = () =>
  oneBundleForEveryKey(async () => new MemoryBundleSource({ "guides/a.md": "# A\n" }));

/** A registry that records every call, whatever its methods are. */
function recordingRegistry(contractVersion: unknown) {
  const calls: string[] = [];
  function record(name: string) {
    return () => {
      calls.push(name);
    };
  }
  const registry = {
    contractVersion,
    register: record("register"),
    registerTemplate: record("registerTemplate"),
    addInstructions: record("addInstructions"),
    addToolNotes: record("addToolNotes"),
  };
  return { registry, calls };
}

const VERSION_TEXT = new Map<unknown, string>([
  [2, "contract version 2"],
  [0, "contract version 0"],
  ["1", 'contract version "1"'],
  [undefined, "no contract version"],
]);

describe("contract version: anything but 1 registers nothing", () => {
  test.each([2, 0, "1", undefined])("mcp:resources with contractVersion %p", (version) => {
    const cds = fakeCds();
    const warnings: string[] = [];
    communityResources(cds, (message) => warnings.push(message)).use({
      choice: CHOICE,
      bundles: bundles(),
    });
    const { registry, calls } = recordingRegistry(version);
    cds.emit("mcp:resources", registry);
    cds.emit("listening");
    expect(calls).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[okf\] mcp:resources — /);
    expect(warnings[0]).toContain(`offers ${VERSION_TEXT.get(version)}, but`);
  });

  test.each([2, 0, "1", undefined])("mcp:hints with contractVersion %p", (version) => {
    const cds = fakeCds();
    const warnings: string[] = [];
    const debug: string[] = [];
    communityHints(
      cds,
      (message) => debug.push(message),
      (message) => warnings.push(message),
    ).use({ choice: CHOICE, bundles: bundles() });
    const { registry, calls } = recordingRegistry(version);
    cds.emit("mcp:hints", registry);
    cds.emit("listening");
    expect(calls).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[okf\] mcp:hints — /);
    expect(warnings[0]).toContain(`offers ${VERSION_TEXT.get(version)}, but`);
    // It arrived, so the "never emitted" line isn't logged too.
    expect(debug).toEqual([]);
  });
});

describe("contract version 1", () => {
  test("version 1 registers as before, without a warning", () => {
    const cds = fakeCds();
    const warnings: string[] = [];
    communityResources(cds, (message) => warnings.push(message)).use({
      choice: CHOICE,
      bundles: bundles(),
    });
    communityHints(
      cds,
      () => undefined,
      (message) => warnings.push(message),
    ).use({
      choice: CHOICE,
      bundles: bundles(),
    });
    const resources = recordingRegistry(1);
    const hints = recordingRegistry(1);
    cds.emit("mcp:resources", resources.registry);
    cds.emit("mcp:hints", hints.registry);
    expect(resources.calls).toEqual(["register", "registerTemplate"]);
    expect(hints.calls).toEqual(["addInstructions", "addToolNotes"]);
    expect(warnings).toEqual([]);
  });

  test("a server that serves nothing over MCP doesn't warn about the version", () => {
    const cds = fakeCds();
    const warnings: string[] = [];
    communityResources(cds, (message) => warnings.push(message)).use(undefined);
    communityHints(
      cds,
      () => undefined,
      (message) => warnings.push(message),
    ).use(undefined);
    cds.emit("mcp:resources", recordingRegistry(2).registry);
    cds.emit("mcp:hints", recordingRegistry(2).registry);
    expect(warnings).toEqual([]);
  });
});
