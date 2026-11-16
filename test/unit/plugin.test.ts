import cds from "@sap/cds";
import { plugin } from "../../src/index";

// The plugin entry is what CAP calls first; if it throws, every app using cap-okf fails to start.
describe("plugin()", () => {
  test("activates without throwing", () => {
    expect(() => plugin(cds)).not.toThrow();
  });
});
