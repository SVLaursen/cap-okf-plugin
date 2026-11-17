import { parseConcept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import { OKF_DEFAULTS, planOkfSetup, type ProjectState } from "../../src/add/plan";

// Task 3.3: what `cds add okf` writes. Maintainer decision 2026-11-17: the cds.okf settings go
// into package.json with their default values (JSON has no comments; the README explains them).

const EMPTY_APP: ProjectState = {
  packageJson: '{\n  "name": "shop",\n  "cds": {\n    "requires": {}\n  }\n}\n',
  gitignore: "node_modules/\n",
  hasCuratedIndex: false,
};

const changeTo = (state: ProjectState, path: string) =>
  planOkfSetup(state).find((change) => change.path === path)?.content;

describe("planOkfSetup on a new app", () => {
  test("creates okf/index.md, one example concept, the .gitignore entry and cds.okf", () => {
    expect(planOkfSetup(EMPTY_APP).map((change) => change.path)).toEqual([
      "okf/index.md",
      "okf/guides/getting-started.md",
      ".gitignore",
      "package.json",
    ]);
  });

  test("the curated files form a valid bundle whose index links to the example and to model/", () => {
    const index = changeTo(EMPTY_APP, "okf/index.md")!;
    const example = changeTo(EMPTY_APP, "okf/guides/getting-started.md")!;
    expect(parseConcept("index.md", index).frontmatter).toEqual({ okf_version: "0.2" });
    expect(index).toContain("(guides/getting-started.md)");
    expect(index).toContain("(model/index.md)");
    const bundle = [
      { path: "index.md", text: index },
      { path: "guides/getting-started.md", text: example },
      { path: "model/index.md", text: "# Model\n" },
    ];
    expect(validateBundle(bundle)).toEqual([]);
  });

  test("adds gen/okf to .gitignore, keeping what is there", () => {
    expect(changeTo(EMPTY_APP, ".gitignore")).toBe("node_modules/\ngen/okf\n");
  });

  test("creates .gitignore when there is none", () => {
    expect(changeTo({ ...EMPTY_APP, gitignore: undefined }, ".gitignore")).toBe("gen/okf\n");
  });

  test("adds cds.okf with the default values, keeping the rest and its indentation", () => {
    const packageJson = JSON.parse(changeTo(EMPTY_APP, "package.json")!);
    expect(packageJson).toEqual({ name: "shop", cds: { requires: {}, okf: OKF_DEFAULTS } });
    expect(OKF_DEFAULTS).toEqual({ include: "services", serve: { static: false, mcp: false } });
    expect(changeTo(EMPTY_APP, "package.json")).toMatch(/^\{\n {2}"name"/);
    expect(
      changeTo({ ...EMPTY_APP, packageJson: '{\n    "name": "x"\n}' }, "package.json"),
    ).toMatch(/^\{\n {4}"name": "x",\n {4}"cds": \{\n {8}"okf"/);
  });
});

describe("planOkfSetup is idempotent", () => {
  test("a second run changes nothing", () => {
    const after: ProjectState = {
      packageJson: changeTo(EMPTY_APP, "package.json")!,
      gitignore: changeTo(EMPTY_APP, ".gitignore")!,
      hasCuratedIndex: true,
    };
    expect(planOkfSetup(after)).toEqual([]);
  });

  test("an existing okf/index.md is kept, and no example is added next to it", () => {
    const paths = planOkfSetup({ ...EMPTY_APP, hasCuratedIndex: true }).map((each) => each.path);
    expect(paths).not.toContain("okf/index.md");
    expect(paths).not.toContain("okf/guides/getting-started.md");
  });

  test.each(["gen", "gen/", "/gen", "/gen/", "gen/okf", "gen/okf/", "/gen/okf", "  gen/  "])(
    ".gitignore already ignoring %j gets no entry",
    (line) => {
      const paths = planOkfSetup({ ...EMPTY_APP, gitignore: `node_modules/\n${line}\n` }).map(
        (each) => each.path,
      );
      expect(paths).not.toContain(".gitignore");
    },
  );

  test("an existing cds.okf block is never changed, whatever it holds", () => {
    const packageJson = '{ "cds": { "okf": { "serve": { "static": true } } } }';
    expect(changeTo({ ...EMPTY_APP, packageJson }, "package.json")).toBeUndefined();
  });

  test("a .gitignore without a final newline gets one before the entry", () => {
    expect(changeTo({ ...EMPTY_APP, gitignore: "node_modules/" }, ".gitignore")).toBe(
      "node_modules/\ngen/okf\n",
    );
  });
});

describe("planOkfSetup refuses what it can't change safely", () => {
  test("no package.json: an [okf] error, since cds add runs in a CAP project", () => {
    expect(() => planOkfSetup({ ...EMPTY_APP, packageJson: undefined })).toThrow(
      /^\[okf\] package\.json — is missing\.\n {2}/,
    );
  });

  test("a package.json that isn't valid JSON: an [okf] error, nothing written", () => {
    expect(() => planOkfSetup({ ...EMPTY_APP, packageJson: "{ nope" })).toThrow(
      /^\[okf\] package\.json — isn't valid JSON/,
    );
  });

  test("a cds entry that isn't an object: an [okf] error", () => {
    expect(() => planOkfSetup({ ...EMPTY_APP, packageJson: '{ "cds": true }' })).toThrow(
      /^\[okf\] package\.json — "cds" isn't an object/,
    );
  });
});
