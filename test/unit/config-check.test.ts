import { configWarnings } from "../../src/config/check";

// Task 4.10: settings under cds.okf that cap-okf would ignore or only reject later get a
// warning naming the key and what is allowed. Values that are wrong but used are already setup
// errors where they are read (include at build, serve.* at startup); during cds build and
// cds compile the serve settings aren't read, so their mistakes are warned about there.

const SERVE = { command: "serve", packageName: "acme-orders" };
const BUILD = { ...SERVE, command: "build" };

describe("configWarnings: unknown keys", () => {
  test.each([
    ["no cds.okf at all", undefined],
    ["the defaults", { include: "services", serve: { static: false, mcp: false } }],
    [
      "every known key",
      {
        include: "all",
        serve: {
          static: "/okf",
          mcp: { plugin: "auto", as: ["tools"], namespace: "x", requires: "admin" },
        },
      },
    ],
  ])("none for %s", (_, okf) => {
    expect(configWarnings(okf, SERVE)).toEqual([]);
  });

  test("a key cap-okf doesn't know, at any level, named with its full path", () => {
    const okf = {
      inculde: "all",
      serve: { statik: true, mcp: { requries: "admin" } },
    };
    expect(configWarnings(okf, SERVE)).toEqual([
      "[okf] cds.okf.inculde — isn't a setting of cap-okf, so it is ignored.\n" +
        "  Use one of: include, projectionSources, serve.",
      "[okf] cds.okf.serve.statik — isn't a setting of cap-okf, so it is ignored.\n" +
        "  Use one of: static, mcp.",
      "[okf] cds.okf.serve.mcp.requries — isn't a setting of cap-okf, so it is ignored.\n" +
        "  Use one of: plugin, as, namespace, requires, related, instructions, pointers, signals.",
    ]);
  });

  test("keys under serve.mcp are only checked when it is an object", () => {
    expect(configWarnings({ serve: { mcp: true } }, SERVE)).toEqual([]);
  });
});

describe("configWarnings: blocks that aren't objects", () => {
  test.each([
    ["cds.okf", true, '{ "include": "services" }'],
    ["cds.okf", ["include"], '{ "include": "services" }'],
    ["cds.okf.serve", "static", '{ "static": true }'],
  ])("%s set to %j is ignored, with a warning", (key, value, example) => {
    const okf = key === "cds.okf" ? value : { serve: value };
    expect(configWarnings(okf, SERVE)).toEqual([
      `[okf] ${key} — ${JSON.stringify(value)} isn't an object, so it is ignored.\n` +
        `  Use an object such as ${example}.`,
    ]);
  });

  test("null counts as not set (a profile may reset a block)", () => {
    expect(configWarnings(null, SERVE)).toEqual([]);
    expect(configWarnings({ serve: null }, SERVE)).toEqual([]);
  });
});

describe("configWarnings: serve settings during cds build and cds compile", () => {
  test("a bad serve.static is a warning, with the message the server would stop with", () => {
    const [warning] = configWarnings({ serve: { static: "okf" } }, BUILD);
    expect(warning).toMatch(/^\[okf\] cds\.okf\.serve\.static — "okf" must start with \//);
  });

  test("a bad serve.mcp setting is a warning", () => {
    const [warning] = configWarnings({ serve: { mcp: { requires: [] } } }, BUILD);
    expect(warning).toMatch(/^\[okf\] cds\.okf\.serve\.mcp\.requires — /);
  });

  test("serve.mcp.as warnings are passed on", () => {
    const okf = { serve: { mcp: { plugin: "@gavdi/cap-mcp", as: ["pages"] } } };
    const warnings = configWarnings(okf, BUILD);
    expect(warnings).toEqual([
      expect.stringMatching(/^\[okf\] cds\.okf\.serve\.mcp\.as — "pages"/),
    ]);
  });

  test("@cap-js/mcp named as the plugin is checked as installed", () => {
    const okf = { serve: { mcp: { plugin: "@cap-js/mcp", as: ["tools"] } } };
    expect(configWarnings(okf, BUILD)).toEqual([]);
  });

  test("an unknown plugin name is a warning", () => {
    const [warning] = configWarnings({ serve: { mcp: { plugin: "community" } } }, BUILD);
    expect(warning).toMatch(
      /^\[okf\] cds\.okf\.serve\.mcp\.plugin — "community" is not a known MCP plugin/,
    );
  });

  test("null serve settings count as not set (a profile resetting them)", () => {
    expect(configWarnings({ serve: { static: null, mcp: null } }, BUILD)).toEqual([]);
  });

  test("compile checks them too", () => {
    expect(configWarnings({ serve: { static: 5 } }, { ...BUILD, command: "compile" })).toHaveLength(
      1,
    );
  });

  test("other commands leave them to startup, which stops with the same message", () => {
    expect(configWarnings({ serve: { static: 5 } }, SERVE)).toEqual([]);
    expect(configWarnings({ serve: { static: 5 } }, { ...SERVE, command: undefined })).toEqual([]);
  });

  // Which MCP plugin is installed is checked at startup: a build checks the settings themselves.
  test("a valid setup gives no warning, and no 'no MCP plugin' note", () => {
    const okf = { serve: { static: true, mcp: { as: ["tools"] } } };
    expect(configWarnings(okf, BUILD)).toEqual([]);
  });
});
