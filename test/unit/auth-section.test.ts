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

/** The text between the markers, markers included. */
function authSectionOf(text: string): string {
  const start = text.indexOf(AUTH_START);
  const end = text.indexOf(AUTH_END);
  return start === -1 ? "" : text.slice(start, end + AUTH_END.length);
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

  test("a privilege without a grant leaves that cell empty: CAP defines no default", () => {
    const model: Csn = {
      definitions: { E: { kind: "entity", "@restrict": [{ to: "Viewer" }], elements: {} } },
    };
    const concept = mapperFor("entity")!.map(
      "E",
      model.definitions["E"]!,
      defaultMapperContext(model),
    );
    expect(concept.body).toContain("|  | `Viewer` |  |");
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
      "## Authorization\n\nRequires: `authenticated-user`\n",
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
