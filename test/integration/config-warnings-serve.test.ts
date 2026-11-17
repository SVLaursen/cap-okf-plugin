import path from "node:path";
import cds from "@sap/cds";

// Task 4.10 at startup: an unknown key under cds.okf is warned about once, and the app still
// serves what the known settings ask for (the demo's static route).

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as object;
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  okf: { serve: { static: true, mcp: false, statik: "/docs" } },
});

const warnings: string[] = [];
const warn = jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
  warnings.push(args.map(String).join(" "));
});
afterAll(() => warn.mockRestore());

const { GET } = cds.test(path.join(__dirname, "..", "..", "demo"));

test("warns once about the unknown key", () => {
  const okfWarnings = warnings.filter((line) => line.includes("[okf] cds.okf.serve.statik —"));
  expect(okfWarnings).toHaveLength(1);
  expect(okfWarnings[0]).toContain("Use one of: static, mcp.");
});

test("still serves what the known settings ask for", async () => {
  expect((await GET("/okf/index.md")).status).toBe(200);
});
