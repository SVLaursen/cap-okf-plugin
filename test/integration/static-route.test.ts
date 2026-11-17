import path from "node:path";
import cds from "@sap/cds";

// Task 4.3: the static route (ADR-0002, ADR-0003, ADR-0005 (d), ADR-0007), on the demo app, whose
// [development] profile turns on cds.okf.serve.static. Mocked users: alice (admin), bob (no
// roles); anonymous requests have no user.

const DEMO = path.join(__dirname, "..", "..", "demo");
const ALICE = { auth: { username: "alice", password: "alice" } };
const BOB = { auth: { username: "bob", password: "bob" } };

const { GET, POST, axios } = cds.test(DEMO);
// Error statuses are answers to check here, not failures.
axios.defaults.validateStatus = () => true;

describe("the static route at /okf", () => {
  test("serves the bundle's root index as Markdown", async () => {
    const response = await GET("/okf/index.md");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/markdown; charset=utf-8");
    expect(response.data).toMatch(/^---\nokf_version: "0\.2"\n---\n/);
  });

  test("a folder path serves its index.md; /okf without a slash redirects to /okf/", async () => {
    expect((await GET("/okf/")).data).toBe((await GET("/okf/index.md")).data);
    expect((await GET("/okf/model/")).data).toBe((await GET("/okf/model/index.md")).data);
    const redirect = await GET("/okf", { maxRedirects: 0 });
    expect(redirect.status).toBe(301);
    expect(redirect.headers["location"]).toBe("/okf/");
  });

  test("serves generated and curated concepts", async () => {
    expect((await GET("/okf/model/CatalogService/Books.md")).data).toContain("type: Projection");
    expect((await GET("/okf/guides/ordering.md")).data).toContain("type: Playbook");
  });

  test("answers 404 for a path that isn't in the bundle, or that tries to leave it", async () => {
    for (const url of [
      "/okf/nope.md",
      "/okf/%2e%2e/package.json",
      "/okf/..%2Fpackage.json",
      "/okf/%zz",
    ]) {
      const response = await GET(url);
      expect({ url, status: response.status }).toEqual({ url, status: 404 });
    }
  });

  test("allows GET and HEAD only", async () => {
    const response = await POST("/okf/index.md", {});
    expect(response.status).toBe(405);
    expect(response.headers["allow"]).toBe("GET, HEAD");
  });

  test("marks answers as private, since they depend on who asks", async () => {
    const response = await GET("/okf/index.md");
    expect(response.headers["cache-control"]).toBe("private, no-cache");
    expect(response.headers["vary"]).toMatch(/Authorization/);
  });

  test("isn't listed on CAP's index page (ADR-0005 (d))", async () => {
    expect((await GET("/")).data).not.toContain("/okf");
  });
});

describe("the static route and authorization sections (ADR-0003)", () => {
  const ORDERS = "/okf/model/AdminService/Orders.md";
  const GUIDE = "/okf/guides/ordering.md";

  test("an anonymous reader gets no authorization section, generated or curated", async () => {
    for (const url of [ORDERS, GUIDE]) {
      const { data } = await GET(url);
      expect({ url, auth: /okf:auth|## Authorization|createdBy/.test(data) }).toEqual({
        url,
        auth: false,
      });
    }
  });

  test("an authenticated reader gets them, whatever their roles", async () => {
    for (const user of [ALICE, BOB]) {
      expect((await GET(ORDERS, user)).data).toContain("<!-- okf:auth:start -->");
      expect((await GET(GUIDE, user)).data).toContain("<!-- okf:auth:start -->");
    }
  });
});
