import path from "node:path";
import cds from "@sap/cds";
import { disabledContract } from "./server.contract";
import { staticRouteChannel } from "./static-route-channel";

// The server contract (4.1) on the demo app with the static route turned off: CDS_CONFIG wins
// over the [development] profile that turns it on (ADR-0002: nothing is served unless on).

// cds.test reads the configuration when the app starts, after this line, so the override counts
// although `import cds` above runs first. Jest gives each test file its own process.env.
const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as Record<string, unknown>;
process.env["CDS_CONFIG"] = JSON.stringify({ ...config, okf: { serve: { static: false } } });

const DEMO = path.join(__dirname, "..", "..", "demo");
const { GET, axios } = cds.test(DEMO);
axios.defaults.validateStatus = () => true;

disabledContract("static route", () => staticRouteChannel(GET), "model/CatalogService/Books.md");

test("with the route off, cds.okf.serve.static really is false", () => {
  expect((cds.env as unknown as { okf: { serve: { static: unknown } } }).okf.serve.static).toBe(
    false,
  );
});
