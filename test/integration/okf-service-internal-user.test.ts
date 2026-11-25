import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/community";

// Review of step 2b: with requires "internal-user", CAP's service-level check lets in-process
// calls through (only its HTTP adapter checks that role, and @protocol: 'none' removes it), so
// OkfService's own check is what keeps a named user without that role out.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } },
  okf: { serve: { mcp: { as: ["tools"], requires: "internal-user" } } },
});

cds.test(path.join(__dirname, "..", "..", "demo"));

type Srv = {
  tx<T>(
    context: object,
    run: (tx: { send(e: string, d?: object): Promise<T> }) => Promise<T>,
  ): Promise<T>;
};
const concept = (user: unknown) =>
  (cds.services as unknown as Record<string, Srv>)["OkfService"]!.tx({ user }, (tx) =>
    tx.send("getConcept", { path: "model/AdminService/Orders.md" }),
  );

test("requires internal-user: anonymous 401, a named user without it 403", async () => {
  await expect(concept(cds.User.anonymous)).rejects.toMatchObject({ code: 401 });
  await expect(concept(new cds.User("bob"))).rejects.toMatchObject({ code: 403 });
});
