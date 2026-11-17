import path from "node:path";
import cds from "@sap/cds";
import { serverContract } from "./server.contract";
import { staticRouteChannel } from "./static-route-channel";

// The server contract (4.1) on the static route (4.3), on the demo app, whose [development]
// profile turns the route on.

const DEMO = path.join(__dirname, "..", "..", "demo");
const { GET, axios } = cds.test(DEMO);
// Error statuses are answers the adapter checks, not failures.
axios.defaults.validateStatus = () => true;

// The static route has no `requires`: anyone may list and read; only the sections are filtered.
serverContract("static route", () => staticRouteChannel(GET), {
  reader: "anonymous",
  concept: { path: "model/CatalogService/Books.md", contains: "type: Projection" },
  curated: "guides/ordering.md",
  withAuthSection: ["model/AdminService/Orders.md", "guides/ordering.md"],
});
