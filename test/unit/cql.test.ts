import { renderExpression } from "../../src/export/cql";

// @restrict where-conditions arrive as CQL expressions (CXN) in CSN. They are written back as the
// CDL text a developer would recognise.

describe("renderExpression", () => {
  test.each([
    [
      "a comparison with $user",
      { xpr: [{ ref: ["country"] }, "=", { ref: ["$user", "country"] }] },
      "country = $user.country",
    ],
    ["a string value", { xpr: [{ ref: ["status"] }, "=", { val: "open" }] }, "status = 'open'"],
    [
      "a quote inside a string value",
      { xpr: [{ ref: ["name"] }, "=", { val: "O'Neil" }] },
      "name = 'O''Neil'",
    ],
    [
      "numbers, booleans and null",
      { xpr: [{ val: 1 }, "<", { val: 2 }, "and", { val: true }, "or", { val: null }] },
      "1 < 2 and true or null",
    ],
  ])("renders %s", (_label, expression, text) => {
    expect(renderExpression(expression)).toBe(text);
  });
});

describe("renderExpression, nested and special tokens", () => {
  test.each([
    [
      "a nested expression in parentheses",
      { xpr: [{ ref: ["a"] }, "and", { xpr: [{ ref: ["b"] }, "or", { ref: ["c"] }] }] },
      "a and (b or c)",
    ],
    [
      "a function call",
      { xpr: [{ func: "exists", args: [{ ref: ["orders"] }] }] },
      "exists(orders)",
    ],
    ["a function call without arguments", { xpr: [{ func: "now" }] }, "now()"],
    [
      "a list",
      { xpr: [{ ref: ["kind"] }, "in", { list: [{ val: "A" }, { val: "B" }] }] },
      "kind in ('A', 'B')",
    ],
    ["an enum symbol", { xpr: [{ ref: ["kind"] }, "=", { "#": "retail" }] }, "kind = #retail"],
    [
      "a path with a filter, which narrows the condition and must never be dropped",
      {
        xpr: [
          { ref: [{ id: "orders", where: [{ ref: ["status"] }, "=", { val: "open" }] }, "ID"] },
        ],
      },
      "orders[status = 'open'].ID",
    ],
    [
      "a path with parameters",
      { xpr: [{ ref: [{ id: "Prices", args: { currency: { val: "EUR" } } }, "amount"] }] },
      "Prices(currency: 'EUR').amount",
    ],
    [
      "text, as CSN keeps a where written in quotes",
      "country = $user.country",
      "country = $user.country",
    ],
    ["a top-level token list", [{ ref: ["a"] }, "=", { val: 1 }], "a = 1"],
  ])("renders %s", (_label, expression, text) => {
    expect(renderExpression(expression)).toBe(text);
  });

  test("anything it doesn't know is shown as JSON, so nothing is lost", () => {
    expect(renderExpression({ SELECT: { from: { ref: ["x"] } } })).toBe(
      '{"SELECT":{"from":{"ref":["x"]}}}',
    );
  });
});
