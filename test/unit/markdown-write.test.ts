import {
  escapeHtml,
  escapeLinkText,
  inlineCode,
  oneLine,
  tableCell,
} from "../../src/core/markdown";

// Helpers that put text from a model into generated Markdown without changing its structure.

describe("inlineCode", () => {
  test.each([
    ["plain", "`plain`"],
    ["has`tick", "``has`tick``"],
    ["two``ticks", "```two``ticks```"],
    ["`starts", "`` `starts ``"],
    ["ends`", "`` ends` ``"],
  ])("%j becomes %s", (text, code) => {
    expect(inlineCode(text)).toBe(code);
  });
});

describe("text escaping", () => {
  test("oneLine joins lines and trims", () => {
    expect(oneLine("  a\n\tb  ")).toBe("a b");
  });

  test("escapeLinkText escapes backslashes and brackets", () => {
    expect(escapeLinkText("a [b] \\ c")).toBe("a \\[b\\] \\\\ c");
  });

  test("escapeHtml shows < instead of starting HTML", () => {
    expect(escapeHtml("<!-- x --> <b>")).toBe("&lt;!-- x --> &lt;b>");
  });

  test("tableCell is one line, without HTML, with | escaped", () => {
    expect(tableCell("a |\n<b>")).toBe("a \\| &lt;b>");
  });
});
