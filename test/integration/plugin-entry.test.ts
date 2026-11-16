import path from "node:path";

// cds-plugin.js is the published entry: it loads the compiled lib/ (ADR-0009), which
// test/build-lib.js builds before the integration tests run.
describe("cds-plugin.js", () => {
  test("can be required without throwing", () => {
    const entry = path.join(__dirname, "..", "..", "cds-plugin.js");
    expect(() => jest.requireActual(entry)).not.toThrow();
  });
});
