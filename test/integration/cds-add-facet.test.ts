import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { registerAddFacet } from "../../src/add/facet";

// Task 3.3: the facet in-process, on a stand-in for cds.add (which exists only while `cds add`
// runs), so its reading and writing are covered too.

interface Facet {
  run(): Promise<void>;
}

function okfFacet(root: string): Facet {
  let registered: (new () => Facet) | undefined;
  const add = {
    Plugin: class {},
    register: (_id: string, plugin: new () => Facet) => (registered = plugin),
  };
  registerAddFacet(Object.create(cds, { add: { value: add }, root: { value: root } }));
  return new registered!();
}

describe("the cds add okf facet", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-add-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("writes the planned files under cds.root, and nothing the second time", async () => {
    fs.writeFileSync(path.join(root, "package.json"), '{ "name": "shop" }\n');
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await okfFacet(root).run();
      expect(fs.existsSync(path.join(root, "okf", "guides", "getting-started.md"))).toBe(true);
      expect(log).toHaveBeenCalledWith("[okf] okf/index.md — written.");
      log.mockClear();
      await okfFacet(root).run();
      expect(log.mock.calls).toEqual([["[okf] the project is already set up; nothing written."]]);
    } finally {
      log.mockRestore();
    }
  });

  test("without a package.json, refuses with the [okf] message and writes nothing", async () => {
    await expect(okfFacet(root).run()).rejects.toThrow(/^\[okf\] package\.json — is missing/);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  test("outside cds add (no cds.add), registers nothing", () => {
    expect(() => registerAddFacet(cds)).not.toThrow();
  });
});
