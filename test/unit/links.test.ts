import { extractLinks, resolveLink } from "../../src/core/links";
import { closestPath, editDistance } from "../../src/core/suggest";

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

  // §5.1 cites sources with footnotes: "[^source-id]: Title" is a note, not a link definition.
  test("a footnote definition is not a link, but a link inside it is", () => {
    const body =
      "[^policy]: Revenue Policy (FY2026)\n[^docs]: [GA4 docs](https://example.com/ga4)\n";
    expect(linksIn(body)).toEqual([["https://example.com/ga4", 2]]);
  });
});

describe("extractLinks CommonMark details", () => {
  test.each([
    ["a double-backtick span holding a backtick link", "`` `[b](y.md)` `` and [c](c.md)", ["c.md"]],
    ["a span closed by the same run only", "``a`b`` [c](c.md)", ["c.md"]],
    ["an escaped bracket", "\\[not](a.md) but [yes](b.md)", ["b.md"]],
    ["balanced parentheses in the target", "[w](notes_(draft).md)", ["notes_(draft).md"]],
    ["escaped brackets in the link text", "[a \\] b](a.md) [c \\[ d](c.md)", ["a.md", "c.md"]],
    ["an unclosed angle bracket, kept as written", "[a](<foo)", ["<foo"]],
  ])("handles %s", (_label, body, targets) => {
    expect(extractLinks(body, 1).map((link) => link.target)).toEqual(targets);
  });

  test("a link whose text wraps onto the next line is found, on the line it starts", () => {
    const body = "Intro.\n\nSee [the\norders table](orders.md) and\n[users](\nusers.md).\n";
    expect(linksIn(body)).toEqual([
      ["orders.md", 3],
      ["users.md", 5],
    ]);
  });

  test("a code block ends a paragraph too, so a link can't span it", () => {
    expect(linksIn("[a\n```\ncode\n```\nb](b.md)")).toEqual([]);
  });

  test("a blank line ends a paragraph, so a link can't span it", () => {
    expect(linksIn("[a\n\nb](b.md)")).toEqual([]);
  });

  test.each([
    ["an info string with a backtick, which is not a fence", "```npm test``` runs it\n[b](b.md)\n"],
    [
      "a closing fence with an info string, which does not close",
      "```\n```js\n[a](a.md)\n```\n[b](b.md)\n",
    ],
  ])("code blocks follow CommonMark: %s", (_label, body) => {
    expect(extractLinks(body, 1).map((link) => link.target)).toEqual(["b.md"]);
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
    ["an encoded /, which reads as a folder separator", "g/x.md", "a%2Fb.md", "g/a/b.md"],
  ])("resolves %s", (_label, from, target, path) => {
    expect(resolveLink(from, target)).toEqual({ kind: "bundle", path });
  });

  test.each([
    ["https://example.com/a.md"],
    ["mailto:shop@example.com"],
    ["cds:sample.bookshop.Books"],
    ["#steps"],
    [""],
    ["//cdn.example.com/a.md"],
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

  test("with a limit, stops early and returns limit + 1 once the distance must exceed it", () => {
    expect(editDistance("kitten", "sitting", 3)).toBe(3);
    expect(editDistance("kitten", "sitting", 2)).toBe(3);
    expect(editDistance("aaaaaaaa", "bbbbbbbb", 1)).toBe(2);
  });
});

describe("closestPath", () => {
  const PATHS = ["guides/ordering.md", "guides/returns.md", "tables/orders.md"];

  test("suggests the path with the smallest edit distance", () => {
    expect(closestPath("guides/retuns.md", PATHS)).toBe("guides/returns.md");
  });

  test("on a tie, suggests the path that sorts first, whatever order the paths come in", () => {
    expect(closestPath("x/b.md", ["x/c.md", "x/a.md"])).toBe("x/a.md");
  });

  test("counts non-ASCII characters too", () => {
    expect(closestPath("guides/bestilling.md", ["guides/bestillíng.md"])).toBe(
      "guides/bestillíng.md",
    );
  });

  test("suggests nothing when every path is too different", () => {
    expect(closestPath("reference/attesters/revenue.py", PATHS)).toBeUndefined();
  });

  // "guides/abc.md" has 13 characters, so up to floor(13 / 3) = 4 edits are allowed.
  test("suggests a path exactly at the allowed distance, and nothing one edit beyond", () => {
    expect(closestPath("guides/abc.md", ["guides/wxyz.md"])).toBe("guides/wxyz.md");
    expect(closestPath("guides/abc.md", ["guides/vwxyz.md"])).toBeUndefined();
  });

  test("allows at least 2 edits for a short path", () => {
    expect(closestPath("a.md", ["abc.md"])).toBe("abc.md");
    expect(closestPath("a.md", ["abcd.md"])).toBeUndefined();
  });

  test("suggests nothing in an empty bundle", () => {
    expect(closestPath("a.md", [])).toBeUndefined();
  });
});
