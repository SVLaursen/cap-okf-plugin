import { closestPath, editDistance, extractLinks, resolveLink } from "../../src/core/links";

// links.ts finds the links in a Markdown body and resolves them against bundle paths
// (OKF v0.2 §6.1). It knows nothing about findings; validateBundle turns broken links into W4.

/** Targets and lines of the links in a body that starts on file line 1. */
function linksIn(body: string): [string, number][] {
  return extractLinks(body, 1).map((link) => [link.target, link.line]);
}

describe("extractLinks", () => {
  test("finds inline links with their file line", () => {
    const body = "# Title\n\nSee [orders](/tables/orders.md) and [users](../users.md).\n";
    expect(linksIn(body)).toEqual([
      ["/tables/orders.md", 3],
      ["../users.md", 3],
    ]);
  });

  test("counts lines from the line the body starts on", () => {
    expect(extractLinks("\n[a](a.md)\n", 6)).toEqual([{ target: "a.md", line: 7 }]);
  });

  test.each([
    ["an image", "![diagram](img/flow.png)", "img/flow.png"],
    ["a link title", '[a](a.md "The A concept")', "a.md"],
    ["an angle-bracket target with a space", "[a](<my notes.md>)", "my notes.md"],
    ["brackets in the link text", "[Orders [beta]](orders.md)", "orders.md"],
    ["a reference definition", "[orders]: /tables/orders.md", "/tables/orders.md"],
    ["a reference definition with a title", '   [o]: orders.md "Orders"', "orders.md"],
  ])("finds the target of %s", (_label, body, target) => {
    expect(linksIn(body)).toEqual([[target, 1]]);
  });

  test("skips links inside fenced code blocks", () => {
    const body = "```md\n[example](missing.md)\n```\n[real](real.md)\n";
    expect(linksIn(body)).toEqual([["real.md", 4]]);
  });

  test("skips links inside inline code", () => {
    expect(linksIn("Write `[a](a.md)` to link, like [b](b.md).")).toEqual([["b.md", 1]]);
  });

  test("a reference link use like [text][label] has no target of its own", () => {
    expect(linksIn("See [orders][o].")).toEqual([]);
  });
});

describe("resolveLink", () => {
  test.each([
    [
      "an absolute path from the bundle root",
      "guides/a.md",
      "/tables/orders.md",
      "tables/orders.md",
    ],
    ["a relative path from the file's folder", "guides/a.md", "b.md", "guides/b.md"],
    ["a ./ path", "guides/a.md", "./b.md", "guides/b.md"],
    ["a ../ path", "guides/deep/a.md", "../b.md", "guides/b.md"],
    ["a path from a root file", "index.md", "tables/index.md", "tables/index.md"],
    ["a #fragment, which is dropped", "a.md", "b.md#steps", "b.md"],
    ["a ?query, which is dropped", "a.md", "b.md?v=2", "b.md"],
    ["a percent-encoded space", "a.md", "my%20notes.md", "my notes.md"],
    ["broken percent-encoding, kept as written", "a.md", "100%.md", "100%.md"],
    ["a folder link, without its trailing /", "index.md", "tables/", "tables"],
  ])("resolves %s", (_label, from, target, path) => {
    expect(resolveLink(from, target)).toEqual({ kind: "bundle", path });
  });

  test.each([
    ["https://example.com/a.md"],
    ["mailto:shop@example.com"],
    ["cds:sample.bookshop.Books"],
    ["#steps"],
    [""],
  ])("%j is not a bundle path", (target) => {
    expect(resolveLink("a.md", target)).toEqual({ kind: "external" });
  });

  test("a path that climbs above the bundle root points outside it", () => {
    expect(resolveLink("guides/a.md", "../../b.md")).toEqual({ kind: "outside" });
  });

  test("a link to the bundle root itself resolves to the empty path", () => {
    expect(resolveLink("guides/a.md", "../")).toEqual({ kind: "bundle", path: "" });
  });
});

describe("editDistance", () => {
  test.each([
    ["", "", 0],
    ["abc", "abc", 0],
    ["", "abc", 3],
    ["retuns", "returns", 1],
    ["kitten", "sitting", 3],
  ])("from %j to %j is %i", (a, b, distance) => {
    expect(editDistance(a, b)).toBe(distance);
    expect(editDistance(b, a)).toBe(distance);
  });
});

describe("closestPath", () => {
  const PATHS = ["guides/ordering.md", "guides/returns.md", "tables/orders.md"];

  test("suggests the path with the smallest edit distance", () => {
    expect(closestPath("guides/retuns.md", PATHS)).toBe("guides/returns.md");
  });

  test("on a tie, suggests the path that sorts first", () => {
    expect(closestPath("x/b.md", ["x/c.md", "x/a.md"])).toBe("x/a.md");
  });

  test("suggests nothing when every path is too different", () => {
    expect(closestPath("reference/attesters/revenue.py", PATHS)).toBeUndefined();
  });

  test("suggests nothing in an empty bundle", () => {
    expect(closestPath("a.md", [])).toBeUndefined();
  });
});
