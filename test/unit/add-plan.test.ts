import { parseConcept } from "../../src/core/concept";
import { validateBundle } from "../../src/core/validate";
import { OKF_DEFAULTS, planOkfSetup, type ProjectState } from "../../src/add/plan";

// Task 3.3: what `cds add okf` writes. Maintainer decision 2026-11-17: the cds.okf settings go
// into package.json with their default values (JSON has no comments; the README explains them).

const NEW_APP: ProjectState = {
  packageJson: '{\n  "name": "shop",\n  "cds": {\n    "requires": {}\n  }\n}\n',
  gitignore: "node_modules/\n",
  curatedFolderIsEmpty: true,
  otherConfig: {},
  buildTarget: "gen",
};

const paths = (state: ProjectState) => planOkfSetup(state).changes.map((change) => change.path);
const changeTo = (state: ProjectState, path: string) =>
  planOkfSetup(state).changes.find((change) => change.path === path)?.content;
const cdsOf = (state: ProjectState) =>
  JSON.parse(changeTo(state, "package.json") ?? state.packageJson!).cds;

describe("planOkfSetup on a new app", () => {
  test("creates okf/index.md, one example concept, the .gitignore entry and cds.okf", () => {
    expect(paths(NEW_APP)).toEqual([
      "okf/index.md",
      "okf/guides/getting-started.md",
      ".gitignore",
      "package.json",
    ]);
    expect(planOkfSetup(NEW_APP).notes).toEqual([]);
  });

  test("the curated files form a valid bundle whose index links to the example and to model/", () => {
    const index = changeTo(NEW_APP, "okf/index.md")!;
    expect(parseConcept("index.md", index).frontmatter).toEqual({ okf_version: "0.2" });
    expect(index).toContain("(guides/getting-started.md)");
    expect(index).toContain("(model/index.md)");
    const bundle = [
      { path: "index.md", text: index },
      {
        path: "guides/getting-started.md",
        text: changeTo(NEW_APP, "okf/guides/getting-started.md")!,
      },
      { path: "model/index.md", text: "# Model\n" },
    ];
    expect(validateBundle(bundle)).toEqual([]);
  });

  test("adds cds.okf with the default values, keeping the rest", () => {
    expect(cdsOf(NEW_APP)).toEqual({ requires: {}, okf: OKF_DEFAULTS });
    expect(OKF_DEFAULTS).toEqual({ include: "services", serve: { static: false, mcp: false } });
  });
});

describe("planOkfSetup: the curated folder", () => {
  test("a folder that isn't empty gets neither index nor example, so nothing is overwritten", () => {
    const state = { ...NEW_APP, curatedFolderIsEmpty: false };
    expect(paths(state)).not.toContain("okf/index.md");
    expect(paths(state)).not.toContain("okf/guides/getting-started.md");
  });
});

describe("planOkfSetup: .gitignore", () => {
  test("adds gen/okf, keeping what is there; creates the file when there is none", () => {
    expect(changeTo(NEW_APP, ".gitignore")).toBe("node_modules/\ngen/okf\n");
    expect(changeTo({ ...NEW_APP, gitignore: undefined }, ".gitignore")).toBe("gen/okf\n");
  });

  test.each([
    "gen",
    "gen/",
    "/gen",
    "/gen/",
    "gen/okf",
    "gen/okf/",
    "/gen/okf",
    "gen/  ",
    "!gen/okf",
  ])("a line %j already decides, so nothing is added", (line) => {
    expect(paths({ ...NEW_APP, gitignore: `node_modules/\n${line}\n` })).not.toContain(
      ".gitignore",
    );
  });

  test("a leading space is part of the pattern, so it doesn't count", () => {
    expect(paths({ ...NEW_APP, gitignore: "  gen/\n" })).toContain(".gitignore");
  });

  test("keeps CRLF line endings, and adds a newline before the entry when the last line has none", () => {
    expect(changeTo({ ...NEW_APP, gitignore: "node_modules/\r\n" }, ".gitignore")).toBe(
      "node_modules/\r\ngen/okf\r\n",
    );
    expect(changeTo({ ...NEW_APP, gitignore: "node_modules/" }, ".gitignore")).toBe(
      "node_modules/\ngen/okf\n",
    );
  });

  test("follows the build target: dist/okf; in-place builds write gen/okf", () => {
    expect(changeTo({ ...NEW_APP, buildTarget: "dist" }, ".gitignore")).toBe(
      "node_modules/\ndist/okf\n",
    );
    expect(changeTo({ ...NEW_APP, buildTarget: "." }, ".gitignore")).toBe(
      "node_modules/\ngen/okf\n",
    );
  });
});

describe("planOkfSetup: cds.okf is never set twice", () => {
  test.each([
    ["package.json, in its base", '{ "cds": { "okf": { "serve": { "static": true } } } }', {}],
    [
      "package.json, in a profile",
      '{ "cds": { "[production]": { "okf": { "include": "all" } } } }',
      {},
    ],
    ["in .cdsrc.json", '{ "name": "x" }', { ".cdsrc.json": '{ "okf": { "include": "all" } }' }],
    [
      "in .cdsrc.json, in a profile",
      '{ "name": "x" }',
      { ".cdsrc.json": '{ "[production]": { "okf": { "serve": { "static": true } } } }' },
    ],
    ["in .cdsrc.yaml", '{ "name": "x" }', { ".cdsrc.yaml": "okf:\n  include: all\n" }],
    ["in .cdsrc.js", '{ "name": "x" }', { ".cdsrc.js": "module.exports = { okf: {} }\n" }],
  ])("already set %s: package.json isn't changed", (_label, packageJson, otherConfig) => {
    expect(changeTo({ ...NEW_APP, packageJson, otherConfig }, "package.json")).toBeUndefined();
  });
});

describe("planOkfSetup: an app's own build.tasks list (ADR-0005)", () => {
  test("gets { for: okf } in package.json, in the base and in each profile that has a list", () => {
    const packageJson = JSON.stringify({
      cds: {
        build: { tasks: [{ for: "nodejs" }] },
        "[production]": { build: { tasks: [{ for: "nodejs" }, { for: "okf" }] } },
        "[hybrid]": { build: { tasks: [{ for: "hana" }] } },
      },
    });
    const cds = cdsOf({ ...NEW_APP, packageJson });
    expect(cds.build.tasks).toEqual([{ for: "nodejs" }, { for: "okf" }]);
    expect(cds["[production]"].build.tasks).toEqual([{ for: "nodejs" }, { for: "okf" }]);
    expect(cds["[hybrid]"].build.tasks).toEqual([{ for: "hana" }, { for: "okf" }]);
  });

  test("gets the task even when cds.okf is already set", () => {
    const packageJson = '{ "cds": { "okf": {}, "build": { "tasks": [{ "for": "nodejs" }] } } }';
    expect(cdsOf({ ...NEW_APP, packageJson }).build.tasks).toContainEqual({ for: "okf" });
  });

  test("gets { for: okf } in .cdsrc.json, keeping that file's style", () => {
    const cdsrc = '{\n\t"build": {\n\t\t"tasks": [{ "for": "nodejs" }]\n\t}\n}\n';
    const updated = changeTo({ ...NEW_APP, otherConfig: { ".cdsrc.json": cdsrc } }, ".cdsrc.json")!;
    expect(JSON.parse(updated).build.tasks).toEqual([{ for: "nodejs" }, { for: "okf" }]);
    expect(updated).toMatch(/^\{\n\t"build"/);
  });

  test("in .cdsrc.yaml, a note asks the developer to add the task", () => {
    const plan = planOkfSetup({
      ...NEW_APP,
      otherConfig: { ".cdsrc.yaml": "build:\n  tasks:\n    - for: nodejs\n" },
    });
    expect(plan.notes).toEqual([
      expect.stringMatching(
        /^\[okf\] \.cdsrc\.yaml — .*\n {2}If it sets build\.tasks, add \{ for: "okf" \}/,
      ),
    ]);
  });
});

describe("planOkfSetup: package.json keeps its style", () => {
  test("indentation with tabs or 4 spaces, CRLF, and a missing final newline", () => {
    const tabsCrlf = '{\r\n\t"name": "x"\r\n}\r\n';
    expect(changeTo({ ...NEW_APP, packageJson: tabsCrlf }, "package.json")).toMatch(
      /^\{\r\n\t"name": "x",\r\n\t"cds": \{\r\n\t\t"okf"/,
    );
    const fourNoNewline = '{\n    "name": "x"\n}';
    expect(changeTo({ ...NEW_APP, packageJson: fourNoNewline }, "package.json")).toMatch(
      /^\{\n {4}"name": "x",\n {4}"cds"[\s\S]*\}$/,
    );
  });
});

describe("planOkfSetup is idempotent", () => {
  test("a second run plans nothing", () => {
    const after: ProjectState = {
      ...NEW_APP,
      packageJson: changeTo(NEW_APP, "package.json")!,
      gitignore: changeTo(NEW_APP, ".gitignore")!,
      curatedFolderIsEmpty: false,
    };
    expect(planOkfSetup(after)).toEqual({ changes: [], notes: [] });
  });
});

describe("planOkfSetup refuses what it can't change safely", () => {
  test.each([
    [undefined, /^\[okf\] package\.json — is missing\.\n {2}/],
    ["{ nope", /^\[okf\] package\.json — isn't valid JSON/],
    ["[1, 2]", /^\[okf\] package\.json — doesn't hold a JSON object/],
    ['{ "cds": true }', /^\[okf\] package\.json — "cds" isn't an object/],
  ])("package.json %j", (packageJson, message) => {
    expect(() => planOkfSetup({ ...NEW_APP, packageJson })).toThrow(message);
  });
});
