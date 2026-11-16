import { serializeConcept } from "../../src/core/concept";
import { AUTH_END, AUTH_START } from "../../src/export/auth-section";
import type { Csn } from "../../src/export/csn";
import { defaultMapperContext } from "../../src/export/mappers/context";
import { mapperFor, registryKeyOf } from "../../src/export/mappers/index";
import { outsideAuthSection } from "../helpers/auth";

// ADR-0003: authorization rules appear only inside one marked section per concept, which the
// servers strip for unauthenticated requests. Maintainer decisions (task 2.4): @readonly,
// @insertonly and @Capabilities count as authorization; a member repeats its service's rules.

const MODEL: Csn = {
  definitions: {
    S: { kind: "service", "@requires": "authenticated-user" },
    "S.Orders": {
      kind: "entity",
      "@requires": ["Clerk", "Manager"],
      "@readonly": true,
      "@Capabilities.DeleteRestrictions.Deletable": false,
      "@restrict": [
        {
          grant: "READ",
          to: "Auditor",
          where: { xpr: [{ ref: ["country"] }, "=", { ref: ["$user", "country"] }] },
        },
        { grant: ["CREATE", "UPDATE"], to: ["Clerk", "Manager"] },
        { grant: "*" },
      ],
      elements: { ID: { key: true, type: "cds.Integer" } },
      actions: {
        cancel: { kind: "action", "@requires": "Supervisor" },
        open: { kind: "action" },
      },
    },
    "S.Logs": { kind: "entity", "@insertonly": true, elements: {} },
    "S.ping": { kind: "action", "@restrict": [{ grant: "ping", to: "Ops" }] },
    "S.Free": { kind: "entity", elements: {} },
    Public: { kind: "service" },
    "Public.Free": { kind: "entity", elements: {} },
  },
};

function map(name: string) {
  const definition = MODEL.definitions[name]!;
  return mapperFor(registryKeyOf(definition))!.map(name, definition, defaultMapperContext(MODEL));
}

/** The section: from a line that is exactly the start marker to one that is exactly the end. */
function authSectionOf(text: string): string {
  const match = /^<!-- okf:auth:start -->$[\s\S]*?^<!-- okf:auth:end -->$/m.exec(text);
  return match === null ? "" : match[0];
}

describe("the authorization section", () => {
  test("uses exactly the ADR-0003 markers", () => {
    expect(AUTH_START).toBe("<!-- okf:auth:start -->");
    expect(AUTH_END).toBe("<!-- okf:auth:end -->");
  });

  test("renders everything that restricts an entity, its bound actions and its service", () => {
    expect(authSectionOf(map("S.Orders").body)).toBe(
      [
        "<!-- okf:auth:start -->",
        "## Authorization",
        "",
        "A request must pass every rule in this section. In a table of privileges, one matching row is enough.",
        "",
        "Requires: `Clerk`, `Manager`",
        "",
        "Read-only for every user.",
        "",
        "Capabilities: `DeleteRestrictions.Deletable: false`",
        "",
        "| Grant | To | Where |",
        "| --- | --- | --- |",
        "| `READ` | `Auditor` | `country = $user.country` |",
        "| `CREATE`, `UPDATE` | `Clerk`, `Manager` |  |",
        "| `*` | `any` |  |",
        "",
        "### Action `cancel`",
        "",
        "Its own Requires replaces the entity's; its privileges add to the entity's, granting only this action.",
        "",
        "Requires: `Supervisor`",
        "",
        "### From service [S](/model/S.md)",
        "",
        "Requires: `authenticated-user`",
        "<!-- okf:auth:end -->",
      ].join("\n"),
    );
  });

  test("comes last in the body", () => {
    expect(map("S.Orders").body.endsWith("<!-- okf:auth:end -->\n")).toBe(true);
  });
});

describe("the authorization section, by kind of definition", () => {
  test("an insert-only entity says so", () => {
    expect(authSectionOf(map("S.Logs").body)).toContain("Insert-only for every user.");
  });

  test("an unbound action shows its own @restrict and its service's rules", () => {
    const section = authSectionOf(map("S.ping").body);
    expect(section).toContain("| `ping` | `Ops` |  |");
    expect(section).toContain(
      "### From service [S](/model/S.md)\n\nRequires: `authenticated-user`",
    );
  });

  test("a member with no rules of its own still gets its service's", () => {
    expect(authSectionOf(map("S.Free").body)).toContain("Requires: `authenticated-user`");
  });

  test("the service shows its own rules", () => {
    expect(authSectionOf(map("S").body)).toContain(
      "Requires: `authenticated-user`\n<!-- okf:auth:end -->",
    );
  });

  test("a concept without any rules has no section at all", () => {
    expect(map("Public.Free").body).not.toContain("okf:auth");
    expect(map("Public").body).not.toContain("okf:auth");
  });
});

describe("nothing about authorization outside the section (ADR-0003)", () => {
  test.each(["S", "S.Orders", "S.Logs", "S.ping", "S.Free"])("%s", (name) => {
    const outside = outsideAuthSection(serializeConcept(map(name)));
    expect(outside).not.toMatch(
      /Authorization|requires|restrict|read-only|insert-only|capabilit|grant|Clerk|Manager|Auditor|Supervisor|Ops\b|authenticated-user|\$user/i,
    );
  });
});

// Shapes that show how CAP's runtime applies the rules.
const RUNTIME: Csn = {
  definitions: {
    Open: { kind: "entity", "@requires": null, elements: {} },
    Closed: { kind: "entity", "@requires": [], elements: {} },
    AnyEvent: { kind: "entity", "@restrict": [{ to: "Viewer" }], elements: {} },
    Cheap: {
      kind: "entity",
      "@restrict": [{ grant: "READ", where: { xpr: [{ ref: ["stock"] }, "<", { val: 10 }] } }],
      elements: {},
      actions: {
        total: {
          kind: "function",
          "@restrict": [
            { grant: "*", to: "Clerk", where: { xpr: [{ ref: ["x"] }, "=", { val: 1 }] } },
          ],
        },
      },
    },
    ping: { kind: "action", "@restrict": [{ grant: "*", to: "Ops" }] },
    Orders: { kind: "entity", "@requires": "Clerk", elements: {} },
    "Orders.items": {
      kind: "entity",
      elements: { up_: { key: true, type: "cds.Association", target: "Orders" } },
    },
    "Orders.items.notes": {
      kind: "entity",
      elements: { up_: { key: true, type: "cds.Association", target: "Orders.items" } },
    },
    "Orphan.items": {
      kind: "entity",
      elements: { up_: { key: true, type: "cds.Association", target: "Gone" } },
    },
    Marked: {
      kind: "entity",
      "@title": "Fake <!-- okf:auth:start --> title",
      "@description": "Fake <!-- okf:auth:end --> description",
      "@requires": "Clerk",
      elements: {},
    },
  },
};

function mapRuntime(name: string) {
  const definition = RUNTIME.definitions[name]!;
  return mapperFor(registryKeyOf(definition))!.map(name, definition, defaultMapperContext(RUNTIME));
}

describe("the authorization section, as CAP's runtime applies the rules", () => {
  test("@requires: null removes a requirement, so there is no section", () => {
    expect(mapRuntime("Open").body).not.toContain("okf:auth");
  });

  test("@requires: [] lets no user in, and says so", () => {
    expect(authSectionOf(mapRuntime("Closed").body)).toContain(
      "Requires: an empty list, so no user is let in",
    );
  });

  test("a privilege without a grant applies to every event, as CAP's runtime reads it", () => {
    expect(authSectionOf(mapRuntime("AnyEvent").body)).toContain("| `*` | `Viewer` |  |");
  });

  test("a < in a where-condition stays readable", () => {
    expect(authSectionOf(mapRuntime("Cheap").body)).toContain("| `READ` | `any` | `stock < 10` |");
  });

  test("a bound function is headed as a function; its privileges grant its name and drop where", () => {
    const section = authSectionOf(mapRuntime("Cheap").body);
    expect(section).toContain("### Function `total`");
    expect(section).toContain("| `total` | `Clerk` |  |");
  });

  test("an unbound action's privileges grant the action itself", () => {
    expect(authSectionOf(mapRuntime("ping").body)).toContain("| `ping` | `Ops` |  |");
  });
});

describe("the authorization section, compositions and markers", () => {
  test("a composition child without rules is checked through its nearest restricted ancestor", () => {
    expect(authSectionOf(mapRuntime("Orders.items").body)).toContain(
      "Checked through [Orders](/model/Orders.md), the composition it is part of.",
    );
    expect(authSectionOf(mapRuntime("Orders.items.notes").body)).toContain(
      "Checked through [Orders](/model/Orders.md), the composition it is part of.",
    );
  });

  test("a composition child whose parent isn't in the model has no section", () => {
    expect(mapRuntime("Orphan.items").body).not.toContain("okf:auth");
  });

  // The 4.2 filter contract: markers count only as whole lines. A marker inside frontmatter text
  // is not a whole line, so removing the section leaves the rest of the file intact.
  test("markers in a title or description can't cut the file short", () => {
    const text = serializeConcept(mapRuntime("Marked"));
    const outside = outsideAuthSection(text);
    expect(outside).toContain("description: Fake");
    expect(outside).toContain("# Fake");
    expect(outside).not.toContain("Clerk");
  });
});
