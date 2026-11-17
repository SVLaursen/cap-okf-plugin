import { MemoryBundleSource } from "../../src/bundle/source";
import { AUTH_END, AUTH_START } from "../../src/core/filter";
import { oneBundleForEveryKey } from "../../src/serve/bundles";
import {
  gavdiResources,
  okfUri,
  type FixedResource,
  type ResourceContext,
  type TemplateResource,
} from "../../src/serve/mcp/gavdi-cap-mcp";
import type { McpChoice } from "../../src/serve/mcp/select";
import { mcpChannels } from "../../src/serve/serving";

// Task 4.6, ADR-0010 Contract A: cap-okf's okf:// resources through @gavdi/cap-mcp's
// mcp:resources event. A fake cds (an event emitter) and a fake registry stand in for CAP and the
// plugin; nothing of the plugin is imported.

const SECRET = "Only for signed-in readers.";
const BUNDLE = {
  "index.md": `# Knowledge\n\nIntro.\n\n${AUTH_START}\n${SECRET}\n${AUTH_END}\n`,
  "guides/index.md": "# Guides\n",
  "guides/cover.png": "",
  "guides/ordering.md": `---\ntype: Guide\n---\n# Ordering\n\n${AUTH_START}\n${SECRET}\n${AUTH_END}\n`,
  "guides/two words.md": "---\ntype: Guide\n---\n# Two words\n",
  "guides/50%25 off.md": "---\ntype: Guide\n---\n# Half price\n",
  "model/Books.md": "---\ntype: Entity\n---\n# Books\n",
};

const CHOICE: McpChoice = {
  plugin: "@gavdi/cap-mcp",
  as: ["resources"],
  namespace: "acme-orders",
  requires: ["authenticated-user"],
  related: false,
  instructions: true,
  pointers: true,
};

/** A cds.User-like caller with the given roles. */
function user(...roles: string[]): { is(role: string): boolean } {
  return { is: (role) => roles.includes(role) };
}
const ANONYMOUS: ResourceContext = { user: user() };
const SIGNED_IN: ResourceContext = { user: user("authenticated-user") };

/** CAP's event emitter, as far as cap-okf uses it. */
function fakeCds() {
  const listeners = new Map<string, ((arg?: unknown) => void)[]>();
  return {
    on(event: string, listener: (...args: never[]) => void) {
      const typed = listener as (arg?: unknown) => void;
      listeners.set(event, [...(listeners.get(event) ?? []), typed]);
    },
    emit(event: string, arg?: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(arg);
    },
  };
}

/** The registry @gavdi/cap-mcp hands to mcp:resources listeners; `templates: false` = without. */
function fakeRegistry({ templates = true } = {}) {
  const fixed: FixedResource[] = [];
  const registered: TemplateResource[] = [];
  const registry = {
    contractVersion: 1 as const,
    register: (resource: FixedResource) => void fixed.push(resource),
    ...(templates && {
      registerTemplate: (template: TemplateResource) => void registered.push(template),
    }),
  };
  return { registry, fixed, templates: registered };
}

/** Starts the channel as serving.ts does: subscribe at load, use at bootstrap, emit at served. */
function served(options: { choice?: McpChoice; templates?: boolean; emit?: boolean } = {}) {
  const cds = fakeCds();
  const warnings: string[] = [];
  const channel = gavdiResources(cds, (message) => warnings.push(message));
  const bundles = oneBundleForEveryKey(async () => new MemoryBundleSource(BUNDLE));
  const viaGavdi = mcpChannels(options.choice ?? CHOICE).viaGavdi;
  channel.use(viaGavdi && { choice: viaGavdi, bundles });
  const fake = fakeRegistry({ templates: options.templates ?? true });
  if (options.emit ?? true) cds.emit("mcp:resources", fake.registry);
  cds.emit("listening");
  return { ...fake, warnings };
}

function concepts(): TemplateResource {
  const { templates } = served();
  expect(templates).toHaveLength(1);
  return templates[0]!;
}

const readConcept = (ctx: ResourceContext, path: string) =>
  concepts().read({ ...ctx, uri: `okf://acme-orders/${path}`, params: { path } });

/** What a thrown error looks like to @gavdi/cap-mcp: a 404 is resource-not-found. */
async function statusOf(answer: unknown): Promise<unknown> {
  try {
    await answer;
    return "no error";
  } catch (error) {
    return (error as { status?: unknown }).status;
  }
}

describe("okf:// resources through @gavdi/cap-mcp (mcp:resources)", () => {
  test("registers one fixed resource for the index and one template for every concept", () => {
    const { fixed, templates, warnings } = served();
    expect(fixed.map((resource) => resource.uri)).toEqual(["okf://acme-orders/index.md"]);
    expect(fixed[0]).toMatchObject({ mimeType: "text/markdown", name: "okf-acme-orders-index" });
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({
      uriTemplate: "okf://acme-orders/{+path}",
      name: "okf-acme-orders-concepts",
      mimeType: "text/markdown",
    });
    expect(templates[0]!.list).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  test("every registered URI is canonical", () => {
    const { fixed, templates } = served();
    for (const { uri } of fixed) expect(new URL(uri).href).toBe(uri);
    const expanded = templates[0]!.uriTemplate.replace("{+path}", "v");
    expect(new URL(expanded).href).toBe(expanded);
  });

  test("registers nothing when resources aren't a chosen channel", () => {
    const { fixed, templates, warnings } = served({ choice: { ...CHOICE, as: ["tools"] } });
    expect([fixed, templates, warnings]).toEqual([[], [], []]);
  });
});

describe("okf:// resources: the index", () => {
  test("is visible only to callers who meet requires", () => {
    const index = served().fixed[0]!;
    expect(index.visible?.(SIGNED_IN)).toBe(true);
    expect(index.visible?.(ANONYMOUS)).toBe(false);
    expect(index.visible?.({ user: undefined })).toBe(false);
  });

  test("is read through the authorization filter", async () => {
    const index = served({ choice: { ...CHOICE, requires: ["any"] } }).fixed[0]!;
    const anyone = { user: user("any") };
    expect(await index.read(anyone)).not.toContain(SECRET);
    expect(await index.read({ user: user("any", "authenticated-user") })).toContain(SECRET);
  });

  test("is a 404 for a caller who doesn't meet requires, should read be called anyway", async () => {
    const index = served().fixed[0]!;
    expect(await statusOf(Promise.resolve(index.read(ANONYMOUS)))).toBe(404);
  });
});

describe("okf:// resources: the concept template's read", () => {
  test("returns the concept as the bundle has it for a signed-in caller", async () => {
    expect(await readConcept(SIGNED_IN, "guides/ordering.md")).toBe(BUNDLE["guides/ordering.md"]);
  });

  test("removes authorization sections for anonymous callers who meet requires", async () => {
    const template = served({ choice: { ...CHOICE, requires: ["any"] } }).templates[0]!;
    const text = await template.read({
      user: user("any"),
      uri: "okf://acme-orders/guides/ordering.md",
      params: { path: "guides/ordering.md" },
    });
    expect(text).toContain("# Ordering");
    expect(text).not.toContain(SECRET);
  });

  test("reads a folder's index.md, as index.md links folders (model/)", async () => {
    expect(await readConcept(SIGNED_IN, "guides/")).toBe(BUNDLE["guides/index.md"]);
  });

  // {+path} lets a client encode "/" or not; both name the same file.
  test("reads an existing file whose / is encoded", async () => {
    expect(await readConcept(SIGNED_IN, "guides%2Fordering.md")).toContain("# Ordering");
  });

  test("decodes params.path once: a space, and a file whose name holds a % escape", async () => {
    expect(await readConcept(SIGNED_IN, "guides/two%20words.md")).toContain("# Two words");
    expect(await readConcept(SIGNED_IN, "guides/50%2525%20off.md")).toContain("# Half price");
  });

  test.each([
    ["an unknown path", "guides/missing.md"],
    ["a malformed escape", "guides/%zz.md"],
    ["a bare %", "guides/%"],
    ["a path that leaves the bundle", "..%2F..%2Fpackage.json"],
    ["an encoded slash in a segment that isn't in the bundle", "guides%2Fmissing.md"],
    ["a file that isn't text", "guides/cover.png"],
    ["a path decoded twice", "guides/50%252525%20off.md"],
  ])("is a 404 for %s", async (_, path) => {
    expect(await statusOf(Promise.resolve(readConcept(SIGNED_IN, path)))).toBe(404);
  });

  test("is a 404 for a caller who doesn't meet requires, as for an unknown path", async () => {
    expect(await statusOf(readConcept(ANONYMOUS, "guides/ordering.md"))).toBe(404);
    expect(await statusOf(readConcept(ANONYMOUS, "guides/missing.md"))).toBe(404);
  });
});

describe("okf:// resources: the concept template's complete", () => {
  // guides/cover.png isn't text, so read can't answer it and it isn't offered.
  test("offers raw readable bundle paths that start with the typed value, sorted", async () => {
    expect(await concepts().complete?.(SIGNED_IN, "path", "guides/")).toEqual([
      "guides/50%25 off.md",
      "guides/index.md",
      "guides/ordering.md",
      "guides/two words.md",
    ]);
  });

  test("offers nothing to a caller who doesn't meet requires, or for another variable", async () => {
    const template = concepts();
    expect(await template.complete?.(ANONYMOUS, "path", "")).toEqual([]);
    expect(await template.complete?.(SIGNED_IN, "other", "")).toEqual([]);
  });
});

describe("okf:// resources: an older @gavdi/cap-mcp", () => {
  test("without registerTemplate: one warning and nothing registered", () => {
    const { fixed, warnings } = served({ templates: false });
    expect(fixed).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[okf\] cds\.okf\.serve\.mcp — .*registerTemplate/);
  });

  test("without the event by listening: one warning naming the event", () => {
    const { warnings } = served({ emit: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[okf\] cds\.okf\.serve\.mcp — .*mcp:resources/);
  });

  test("no warning at listening when resources aren't a chosen channel", () => {
    expect(served({ choice: { ...CHOICE, as: ["tools"] }, emit: false }).warnings).toEqual([]);
  });
});

describe("okfUri", () => {
  test("encodes each path segment, so the URI is canonical", () => {
    expect(okfUri("acme-orders", "guides/two words.md")).toBe(
      "okf://acme-orders/guides/two%20words.md",
    );
    expect(okfUri("acme-orders", "guides/50%25 off.md")).toBe(
      "okf://acme-orders/guides/50%2525%20off.md",
    );
  });
});

describe("okf:// resources: one process, several servers", () => {
  test("a server without resources doesn't reuse the previous server's setup", () => {
    const cds = fakeCds();
    const warnings: string[] = [];
    const channel = gavdiResources(cds, (message) => warnings.push(message));
    const bundles = oneBundleForEveryKey(async () => new MemoryBundleSource(BUNDLE));
    channel.use({ choice: CHOICE, bundles });
    cds.emit("mcp:resources", fakeRegistry().registry);
    cds.emit("listening");
    channel.use(undefined); // the second server's bootstrap, resources off
    const second = fakeRegistry();
    cds.emit("mcp:resources", second.registry);
    cds.emit("listening");
    expect([second.fixed, second.templates, warnings]).toEqual([[], [], []]);
  });

  test("the missing-event warning is checked again for each server", () => {
    const cds = fakeCds();
    const warnings: string[] = [];
    const channel = gavdiResources(cds, (message) => warnings.push(message));
    const bundles = oneBundleForEveryKey(async () => new MemoryBundleSource(BUNDLE));
    channel.use({ choice: CHOICE, bundles });
    cds.emit("mcp:resources", fakeRegistry().registry);
    cds.emit("listening");
    channel.use({ choice: CHOICE, bundles });
    cds.emit("listening");
    expect(warnings).toHaveLength(1);
  });
});

describe("mcpChannels", () => {
  const choice = (plugin: McpChoice["plugin"], as: McpChoice["as"]): McpChoice => ({
    ...CHOICE,
    plugin,
    as,
  });

  test.each([
    ["nothing over MCP", undefined, []],
    ["@gavdi/cap-mcp, resources", choice("@gavdi/cap-mcp", ["resources"]), ["viaGavdi"]],
    ["@gavdi/cap-mcp, tools", choice("@gavdi/cap-mcp", ["tools"]), ["tools"]],
    [
      "@gavdi/cap-mcp, both",
      choice("@gavdi/cap-mcp", ["resources", "tools"]),
      ["tools", "viaGavdi"],
    ],
    ["@cap-js/mcp, resources (no resource hook, 4.7)", choice("@cap-js/mcp", ["resources"]), []],
    ["@cap-js/mcp, tools", choice("@cap-js/mcp", ["tools"]), ["tools"]],
  ])("%s", (_, mcp, channels) => {
    expect(Object.keys(mcpChannels(mcp)).sort()).toEqual(channels);
  });
});
