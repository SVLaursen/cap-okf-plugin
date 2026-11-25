import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/community";

// Task 4.5 step 2b (ADR-0010): cds.okf.serve.mcp.requires becomes OkfService's @requires, so CAP
// enforces it on every call, as the MCP plugin makes them (cds.services.OkfService.tx).

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } },
  okf: { serve: { mcp: { as: ["tools"], requires: ["admin"] } } },
});

const DEMO = path.join(__dirname, "..", "..", "demo");
cds.test(DEMO);

type Service = {
  tx<T>(
    context: object,
    run: (tx: { send(event: string, data?: object): Promise<T> }) => Promise<T>,
  ): Promise<T>;
};
const info = (user: unknown) =>
  (cds.services as unknown as Record<string, Service>)["OkfService"]!.tx({ user }, (tx) =>
    tx.send("bundleInfo"),
  );

describe("OkfService and cds.okf.serve.mcp.requires", () => {
  test("is the service's @requires", () => {
    expect(cds.model!.definitions["OkfService"]?.["@requires"]).toEqual(["admin"]);
  });

  test("an anonymous caller is refused with 401, a user without the role with 403", async () => {
    await expect(info(cds.User.anonymous)).rejects.toMatchObject({ code: 401 });
    await expect(info(new cds.User("bob"))).rejects.toMatchObject({ code: 403 });
  });

  test("a user with the role gets an answer", async () => {
    await expect(
      info(new cds.User({ id: "alice", roles: ["admin"], attr: {} })),
    ).resolves.toMatchObject({
      okfVersion: "0.2",
    });
  });
});

// Review of step 2b: CAP's own check skips "internal-user" on in-process calls (and apps can
// switch service-level checks off), so OkfService checks requires itself, on every tool.
describe("OkfService enforces requires itself, on every tool and through cds.context", () => {
  type Tx = {
    run(q: unknown): Promise<unknown>;
    send(event: string, data?: object): Promise<unknown>;
  };
  type Srv = { tx<T>(run: (tx: Tx) => Promise<T>): Promise<T> };
  const service = () => (cds.services as unknown as Record<string, Srv>)["OkfService"]!;
  const INDEX = { SELECT: { from: { ref: ["OkfService.Index"] } } };

  // As @gavdi/cap-mcp calls it: srv.tx(fn), inheriting the request's cds.context.
  async function asUser(user: unknown, call: (tx: Tx) => Promise<unknown>) {
    return cds.tx({ user }, () => service().tx(call));
  }

  test.each([
    ["Index", (tx: Tx) => tx.run(INDEX)],
    ["getConcept", (tx: Tx) => tx.send("getConcept", { path: "index.md" })],
    ["searchConcepts", (tx: Tx) => tx.send("searchConcepts", { text: "x" })],
  ])("%s: anonymous 401, without the role 403", async (_label, call) => {
    await expect(asUser(cds.User.anonymous, call)).rejects.toMatchObject({ code: 401 });
    await expect(asUser(new cds.User("bob"), call)).rejects.toMatchObject({ code: 403 });
  });
});
