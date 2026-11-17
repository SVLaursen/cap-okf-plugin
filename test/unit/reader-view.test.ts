import { mergeBundle } from "../../src/bundle/merge";
import { parseConcept, type Concept } from "../../src/core/concept";
import { generateIndexes } from "../../src/core/index-md";
import { readerView, snapshotOf, viewKey, type Reader } from "../../src/serve/reader-view";
import { withRelated } from "../../src/serve/related";
import { readerOf } from "../../src/serve/views";

// ADR-0012 (amends ADR-0003): a concept with `requires:` exists only for readers with one of
// those roles, on every surface; counts in indexes are the reader's own.

const generatedConcept = (path: string, title: string, body = ""): Concept =>
  parseConcept(path, `---\ntype: Entity\ntitle: ${title}\ndescription: ${title}.\n---\n${body}`);

const GENERATED: Concept[] = [
  generatedConcept("model/S/Orders.md", "Orders"),
  generatedConcept("model/S/Payments.md", "Payments"),
  ...generateIndexes(
    [
      generatedConcept("model/S/Orders.md", "Orders"),
      generatedConcept("model/S/Payments.md", "Payments"),
    ],
    "model",
  ),
];

const note = (title: string, extra: string, body: string) =>
  `---\ntype: Guide\ntitle: ${title}\ndescription: About ${title}.\n${extra}---\n\n${body}`;

const CURATED = [
  {
    path: "guides/shipping.md",
    text: note(
      "Shipping",
      "",
      "Orders ship from [Orders](/model/S/Orders.md).\n\nThe [margin rules](/finance/margins.md) apply.\n\n## See also\n\n- [Margins](/finance/margins.md) - the confidential one\n\n## Contacts\n\nThe shop team.\n",
    ),
  },
  {
    path: "finance/margins.md",
    text: note(
      "Margins",
      "requires: [finance, controller]\n",
      "Margins come from [Payments](/model/S/Payments.md).\n",
    ),
  },
  {
    path: "finance/budget.md",
    text: note("Budget", "requires: finance\n", "Yearly.\n"),
  },
];

const FILES = mergeBundle(GENERATED, CURATED, "0.2").files;
const SNAPSHOT = snapshotOf(FILES);

const reader = (isAuthenticated: boolean, ...roles: string[]): Reader => ({
  isAuthenticated,
  is: (role) => roles.includes(role) || (isAuthenticated && role === "authenticated-user"),
});

describe("readerView: a concept with requires", () => {
  const outsider = readerView(SNAPSHOT, reader(true));
  const finance = readerView(SNAPSHOT, reader(true, "finance"));

  test("is not listed, readable or a concept for a reader without the role", () => {
    expect(outsider.paths).not.toContain("finance/margins.md");
    expect(outsider.read("finance/margins.md")).toBeUndefined();
    expect(outsider.concept("finance/margins.md")).toBeUndefined();
    expect(outsider.concepts.map((each) => each.path)).not.toContain("finance/margins.md");
  });

  test("is there, with its requires key, for a reader with one of the roles", () => {
    expect(finance.paths).toContain("finance/margins.md");
    expect(finance.read("finance/margins.md")).toContain("requires: [finance, controller]");
  });

  test("a folder whose concepts are all hidden loses its generated index", () => {
    expect(outsider.paths).not.toContain("finance/index.md");
    expect(outsider.read("finance/index.md")).toBeUndefined();
    expect(finance.read("finance/index.md")).toContain("[Margins](margins.md)");
  });

  test("the root index lists it only for readers who see it", () => {
    expect(outsider.read("index.md")).not.toMatch(/Margins|Budget|finance/);
    expect(finance.read("index.md")).toContain("[Margins](finance/margins.md)");
    expect(finance.read("index.md")).toContain("[Budget](finance/budget.md)");
  });

  test("other concepts lose links and list entries pointing at it; the link text stays", () => {
    const text = outsider.read("guides/shipping.md")!;
    expect(text).not.toContain("margins.md");
    expect(text).not.toContain("the confidential one");
    expect(text).not.toContain("## See also");
    expect(text).toContain("The margin rules apply.\n\n## Contacts\n\nThe shop team.\n");
    expect(finance.read("guides/shipping.md")).toContain("[Margins](/finance/margins.md)");
  });

  test("the related block never names it", () => {
    const path = "guides/shipping.md";
    expect(withRelated(outsider, path, outsider.read(path)!)).not.toContain("margins");
    expect(withRelated(finance, path, finance.read(path)!)).toContain(
      "- [Margins](/finance/margins.md) - About Margins.",
    );
  });
});

describe("readerView: the requires key itself", () => {
  test("an anonymous reader never gets the requires key", () => {
    const anyone = snapshotOf([
      { path: "open.md", text: note("Open", "requires: any\n", "Hello.\n") },
    ]);
    const anonymous = readerView(anyone, { isAuthenticated: false, is: (role) => role === "any" });
    expect(anonymous.read("open.md")).not.toContain("requires");
    expect(anonymous.read("open.md")).toContain("title: Open");
  });

  test("a requires value that isn't a role or a list hides the concept from everyone", () => {
    const broken = snapshotOf([{ path: "x.md", text: note("X", "requires: 3\n", "") }]);
    expect(readerView(broken, reader(true, "admin")).paths).toEqual([]);
  });
});

describe("readerView: counts and keys", () => {
  test("an index's counts are the reader's own", () => {
    const files = mergeBundle(
      GENERATED,
      [
        { path: "notes/sub/a.md", text: note("A", "", "") },
        { path: "notes/sub/b.md", text: note("B", "requires: x\n", "") },
      ],
      "0.2",
    ).files;
    const snapshot = snapshotOf(files);
    expect(readerView(snapshot, reader(true, "x")).read("notes/index.md")).toContain(
      "2 concepts: Guide",
    );
    expect(readerView(snapshot, reader(true)).read("notes/index.md")).toContain("1 concept: Guide");
  });

  test("without hidden concepts every file is served as stored (auth sections aside)", () => {
    const view = readerView(SNAPSHOT, reader(true, "finance", "controller"));
    for (const file of FILES) expect({ path: file.path, text: view.read(file.path) }).toEqual(file);
  });

  test("readers with the same roles of the bundle share a key", () => {
    expect(viewKey(SNAPSHOT, reader(true, "finance", "other"))).toBe(
      viewKey(SNAPSHOT, reader(true, "finance")),
    );
    expect(viewKey(SNAPSHOT, reader(true, "finance"))).not.toBe(viewKey(SNAPSHOT, reader(true)));
    expect(SNAPSHOT.roles).toEqual(["controller", "finance"]);
  });

  test("the generated indexes are recognised; a hand-written one is only filtered", () => {
    expect([...SNAPSHOT.generatedIndexes].sort()).toEqual([
      "finance/index.md",
      "guides/index.md",
      "index.md",
      "model/S/index.md",
      "model/index.md",
    ]);
    const own = snapshotOf([
      ...FILES.filter((file) => file.path !== "index.md"),
      {
        path: "index.md",
        text: "# Notes\n\n* [Margins](finance/margins.md) - M.\n* [Shipping](guides/shipping.md) - S.\n",
      },
    ]);
    expect(own.generatedIndexes.has("index.md")).toBe(false);
    expect(readerView(own, reader(true)).read("index.md")).toBe(
      "# Notes\n\n* [Shipping](guides/shipping.md) - S.\n",
    );
  });
});

describe("readerView: a hand-written folder index (review)", () => {
  test("whose concepts are all hidden is gone, as an unknown folder", () => {
    const snapshot = snapshotOf([
      { path: "hr/index.md", text: "# Notes\n\n* [D](d.md) - D.\n" },
      { path: "hr/d.md", text: note("D", "requires: boss\n", "") },
    ]);
    const view = readerView(snapshot, reader(true));
    expect(view.paths).toEqual([]);
    expect(view.read("hr/index.md")).toBeUndefined();
    expect(readerView(snapshot, reader(true, "boss")).paths).toEqual(["hr/d.md", "hr/index.md"]);
  });
});

describe("readerOf", () => {
  test("asks the CAP user; no user is an anonymous reader without roles", () => {
    const user = { is: (role: string) => role === "authenticated-user" || role === "finance" };
    expect(readerOf(user).isAuthenticated).toBe(true);
    expect(readerOf(user).is("finance")).toBe(true);
    expect(readerOf(undefined).isAuthenticated).toBe(false);
    expect(readerOf({}).is("any")).toBe(false);
  });
});
