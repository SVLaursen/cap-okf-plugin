import { selectMcp } from "../../src/serve/mcp/select";

// Task 4.4 (ADR-0004, ADR-0006, ADR-0010): cds.okf.serve.mcp is false | true |
// { plugin, as, namespace, requires }. Detection (by package name in CAP's plugin list) only
// decides how to serve once the developer has said that they want it.

const GAVDI = "@gavdi/cap-mcp";
const CAPJS = "@cap-js/mcp";

function select(
  mcp: unknown,
  installed: string[] = [],
  packageName: string | undefined = "@acme/orders",
) {
  return selectMcp({ okf: { serve: { mcp } }, installed, packageName });
}

describe("selectMcp: on, off and which plugin", () => {
  test.each([undefined, false])("off (%j): nothing, and no warning", (mcp) => {
    expect(select(mcp, [GAVDI, CAPJS])).toEqual({ warnings: [] });
  });

  test("on without an MCP plugin: nothing served, one warning", () => {
    expect(select(true, [])).toEqual({
      warnings: [
        expect.stringMatching(
          /^\[okf\] cds\.okf\.serve\.mcp — is on, but no MCP plugin is installed/,
        ),
      ],
    });
  });

  test.each([
    [GAVDI, "resources"],
    [CAPJS, "tools"],
  ])("on with only %s: that plugin, on its natural channel", (plugin, channel) => {
    expect(select(true, [plugin, "@cap-js/sqlite"])).toEqual({
      choice: { plugin, as: [channel], namespace: "acme-orders", requires: ["authenticated-user"] },
      warnings: [],
    });
  });

  test("on with both and plugin auto: an error that asks for plugin", () => {
    expect(() => select(true, [GAVDI, CAPJS])).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp — both @gavdi\/cap-mcp and @cap-js\/mcp are installed[\s\S]*\n {2}Set cds\.okf\.serve\.mcp\.plugin/,
    );
  });

  test("with both, an explicit plugin is used", () => {
    expect(select({ plugin: CAPJS }, [GAVDI, CAPJS]).choice?.plugin).toBe(CAPJS);
  });

  test("an explicit plugin that isn't installed: an error", () => {
    expect(() => select({ plugin: GAVDI }, [CAPJS])).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp\.plugin — @gavdi\/cap-mcp is set, but not installed/,
    );
  });

  test("an unknown plugin name: an error naming the allowed values", () => {
    expect(() => select({ plugin: "mcp-x" }, [GAVDI])).toThrow(
      /"auto", "@gavdi\/cap-mcp" or "@cap-js\/mcp"/,
    );
  });
});

describe("selectMcp: channels (as)", () => {
  test("both channels when asked", () => {
    expect(select({ as: ["resources", "tools"] }, [GAVDI]).choice?.as).toEqual([
      "resources",
      "tools",
    ]);
  });

  test("an unknown as value: a warning naming the allowed values, and it is left out", () => {
    const result = select({ as: ["tools", "prompts"] }, [GAVDI]);
    expect(result.choice?.as).toEqual(["tools"]);
    expect(result.warnings).toEqual([
      expect.stringMatching(
        /^\[okf\] cds\.okf\.serve\.mcp\.as — "prompts" is not a channel[\s\S]*"resources" or "tools"/,
      ),
    ]);
  });

  test("nothing usable left in as: the plugin's natural channel, with the warning", () => {
    const result = select({ as: ["prompts"] }, [CAPJS]);
    expect(result.choice?.as).toEqual(["tools"]);
    expect(result.warnings).toHaveLength(1);
  });

  test("as written as one string is one channel", () => {
    expect(select({ as: "tools" }, [GAVDI]).choice?.as).toEqual(["tools"]);
  });
});

describe("selectMcp: namespace (ADR-0010)", () => {
  test.each([
    ["@acme/orders", "acme-orders"],
    ["Bookshop", "bookshop"],
    ["my-app", "my-app"],
  ])("derived from the package name %j → %j", (packageName, namespace) => {
    expect(select(true, [GAVDI], packageName).choice?.namespace).toBe(namespace);
  });

  test("an explicit namespace wins", () => {
    expect(select({ namespace: "shop" }, [GAVDI]).choice?.namespace).toBe("shop");
  });

  test.each([
    [{ namespace: "Shop!" }, "@acme/orders"],
    [{ namespace: "-shop" }, "@acme/orders"],
    [true, "my_app"],
  ])("an invalid namespace (%j, package %j): a startup error", (mcp, packageName) => {
    expect(() => select(mcp, [GAVDI], packageName)).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp\.namespace — .* isn't a valid namespace/,
    );
  });

  test("no namespace and no package name to derive one: a startup error", () => {
    expect(() => select(true, [GAVDI], undefined)).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp\.namespace — is missing/,
    );
  });
});

describe("selectMcp: requires", () => {
  test.each([
    [undefined, ["authenticated-user"]],
    ["admin", ["admin"]],
    [
      ["admin", "support"],
      ["admin", "support"],
    ],
  ])("requires %j → %j", (requires, roles) => {
    expect(select({ requires }, [GAVDI]).choice?.requires).toEqual(roles);
  });

  test("requires that isn't a role or a list of roles: an error", () => {
    expect(() => select({ requires: 5 }, [GAVDI])).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp\.requires — /,
    );
  });
});

describe("selectMcp: a setting that isn't false, true or an object", () => {
  test("is an error naming the allowed values", () => {
    expect(() => select("yes", [GAVDI])).toThrow(
      /^\[okf\] cds\.okf\.serve\.mcp — "yes" is not a known value/,
    );
  });
});
