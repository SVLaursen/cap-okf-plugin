import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import {
  addToolsModel,
  annotateToolsModel,
  TOOLS_MODEL_KEY,
  toolsModelPath,
  wantsToolsModel,
  warnWithoutToolsModel,
} from "../../src/serve/mcp/tools-model";

// Task 4.5 (ADR-0005 (e)): when the tools channel counts as on, with the 4.4 selector's rules.

const GAVDI = { plugins: { "@gavdi/cap-mcp": { impl: "x" } } };
let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-tools-"));
  fs.writeFileSync(path.join(root, "package.json"), '{ "name": "@acme/orders" }');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function appCds(env: object, extra: object = {}): typeof cds {
  return Object.create(cds, {
    env: { value: { requires: {}, ...env } },
    root: { value: root },
    ...extra,
  });
}

describe("wantsToolsModel and addToolsModel", () => {
  test.each([
    ["mcp off", { okf: { serve: { mcp: false } }, ...GAVDI }, false],
    ["mcp on, no plugin installed", { okf: { serve: { mcp: true } } }, false],
    [
      "mcp on with @gavdi/cap-mcp: its natural channel is resources",
      { okf: { serve: { mcp: true } }, ...GAVDI },
      false,
    ],
    ["as: [tools]", { okf: { serve: { mcp: { as: ["tools"] } } }, ...GAVDI }, true],
    [
      "as: [resources, tools]",
      { okf: { serve: { mcp: { as: ["resources", "tools"] } } }, ...GAVDI },
      true,
    ],
    [
      "a setup mistake counts as off here",
      { okf: { serve: { mcp: { plugin: "nope", as: ["tools"] } } }, ...GAVDI },
      false,
    ],
  ])("%s → %s", (_label, env, expected) => {
    const app = appCds(env);
    expect(wantsToolsModel(app)).toBe(expected);
    addToolsModel(app);
    const requires = (app.env as unknown as { requires: Record<string, unknown> }).requires;
    expect(requires[TOOLS_MODEL_KEY]).toEqual(expected ? { model: toolsModelPath() } : undefined);
  });

  test("the model file is there, at the path the package ships", () => {
    expect(fs.existsSync(toolsModelPath())).toBe(true);
  });
});

describe("warnWithoutToolsModel", () => {
  function served(env: object, model: object): string[] {
    const events = new EventEmitter();
    const warnings: string[] = [];
    const app = appCds(env, {
      on: { value: (event: string, listener: () => void) => events.on(event, listener) },
      model: { value: model },
      log: { value: () => ({ warn: (message: string) => warnings.push(message) }) },
    });
    warnWithoutToolsModel(app);
    events.emit("served");
    return warnings;
  }
  const toolsOn = { okf: { serve: { mcp: { as: ["tools"] } } }, ...GAVDI };

  test("tools on but OkfService missing (an own task list without okf): one warning", () => {
    expect(served(toolsOn, { definitions: {} })).toEqual([
      expect.stringMatching(
        /^\[okf\] OkfService — the MCP tools channel is on, but OkfService isn't in the app's model\.\n {2}/,
      ),
    ]);
  });

  test("tools on and OkfService there, or tools off: no warning", () => {
    expect(served(toolsOn, { definitions: { OkfService: {} } })).toEqual([]);
    expect(served({ okf: {} }, { definitions: {} })).toEqual([]);
  });
});

// Review of 4.5 step 2b: annotations on every loaded model.
describe("annotateToolsModel", () => {
  function loaded(env: object): Record<string, unknown> {
    const events = new EventEmitter();
    const app = appCds(env, {
      on: {
        value: (event: string, listener: (csn: unknown) => void) => events.on(event, listener),
      },
    });
    annotateToolsModel(app);
    const csn = {
      definitions: { OkfService: { kind: "service", "@mcp": true } as Record<string, unknown> },
    };
    events.emit("loaded", csn);
    return csn.definitions.OkfService;
  }

  test("tools on: @requires from the settings, and @protocol none under @gavdi/cap-mcp", () => {
    const service = loaded({
      okf: { serve: { mcp: { as: ["tools"], requires: "admin" } } },
      ...GAVDI,
    });
    expect(service).toMatchObject({ "@requires": ["admin"], "@protocol": "none", "@mcp": true });
  });

  test("a model built with tools, served with them off: @mcp false, so no broken tools", () => {
    expect(loaded({ okf: { serve: { mcp: false } }, ...GAVDI })["@mcp"]).toBe(false);
    expect(loaded({ okf: { serve: { mcp: true } }, ...GAVDI })["@mcp"]).toBe(false);
  });
});
