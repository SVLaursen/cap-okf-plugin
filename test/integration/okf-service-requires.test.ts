import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/gavdi";

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
    await expect(info(cds.User.anonymous)).rejects.toMatchObject({ code: "401" });
    await expect(info(new cds.User({ id: "bob" }))).rejects.toMatchObject({ code: "403" });
  });

  test("a user with the role gets an answer", async () => {
    await expect(info(new cds.User({ id: "alice", roles: { admin: 1 } }))).resolves.toMatchObject({
      okfVersion: "0.2",
    });
  });
});
