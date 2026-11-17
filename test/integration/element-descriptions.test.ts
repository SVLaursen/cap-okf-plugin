import cds from "@sap/cds";
import { serializeConcept } from "../../src/core/concept";
import type { Csn } from "../../src/export/csn";
import { exportModel } from "../../src/export/exporter";

// ADR-0012: element descriptions in the tables, inherited along a projection's columns by the
// element each one is selected from, never by name alone (review finding: an alias took the
// description of another element).

const SHAPES = `
  namespace db;
  entity Orders {
    key ID : Integer;
    /** Internal status code; do not filter on it. */
    status : String(1);
    /** Customer-facing state. */
    state  : String(20);
    @description: 'Total in the order currency.'
    total  : Decimal(9, 2);
    note   : String;
  }
  service S {
    entity Orders as projection on db.Orders { ID, state as status, status as legacy, total, 'x' as fixed : String };
    entity Everything as projection on db.Orders;
    action ship(@description: 'How many days at most.' days : Integer);
  }
`;

function conceptText(path: string): string {
  const model = (cds.compile as (model: string, options: object) => unknown)(SHAPES, {
    docs: true,
  }) as Csn;
  const concepts = exportModel(model, { include: "services", now: new Date(0), version: "0.0.0" });
  return serializeConcept(concepts.find((each) => each.path === path)!);
}

describe("element descriptions in the tables", () => {
  test("an aliased column takes the description of the element it selects", () => {
    const text = conceptText("model/db/S/Orders.md");
    expect(text).toContain("| `status` | `String(20)` | Customer-facing state. |");
    expect(text).toContain(
      "| `legacy` | `String(1)` | Internal status code; do not filter on it. |",
    );
    expect(text).toContain("| `total` | `Decimal(9, 2)` | Total in the order currency. |");
    expect(text).toMatch(/\| `fixed` \| `String` \| {2}\|/);
  });

  test("a projection without columns takes them by name", () => {
    expect(conceptText("model/db/S/Everything.md")).toContain(
      "| `status` | `String(1)` | Internal status code; do not filter on it. |",
    );
  });

  test("a parameter's @description is in its table", () => {
    expect(conceptText("model/db/S/ship.md")).toContain(
      "| `days` | `Integer` | How many days at most. |",
    );
  });
});
