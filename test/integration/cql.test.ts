import cds from "@sap/cds";
import { renderExpression } from "../../src/export/cql";

// Where-conditions exactly as CAP compiles them, rendered back to CDL.

const MODEL = `
  entity Orders @(restrict: [
    { grant: 'READ', where: (exists items[status = 'open' and pos > 1].sub) },
    { grant: 'READ', where: (stock < 10 and amount between 1 and 5) },
    { grant: 'READ', where: (not (owner is null) and owner = $user and created < $now) },
    { grant: 'READ', where: 'country = $user.country' }
  ]) {
    key ID : Integer; stock : Integer; amount : Integer; owner : String; created : Timestamp;
    country : String; items : Composition of many Items on items.order = $self;
  }
  entity Items { key ID : Integer; order : Association to Orders; status : String; pos : Integer;
    sub : Association to Items; }
`;

test.each([
  [0, "exists items[status = 'open' and pos > 1].sub"],
  [1, "stock < 10 and amount between 1 and 5"],
  // CAP compiles $user to $user.id, which means the same.
  [2, "not (owner is null) and owner = $user.id and created < $now"],
  [3, "country = $user.country"],
])("privilege %i renders as %s", (index, text) => {
  const csn = cds.compile(MODEL) as unknown as {
    definitions: Record<string, { "@restrict": { where: unknown }[] }>;
  };
  expect(renderExpression(csn.definitions["Orders"]!["@restrict"][index]!.where)).toBe(text);
});
