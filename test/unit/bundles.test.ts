import { MemoryBundleSource } from "../../src/bundle/source";
import { oneBundleForEveryKey } from "../../src/serve/bundles";

// Task 4.1 / ADR-0010: the bundle is looked up by (tenant, locale). In release 0.2 every key
// gets the same bundle, loaded once; per-tenant or per-locale bundles come with their own ADR.

describe("oneBundleForEveryKey", () => {
  test("every tenant and locale gets the same bundle, loaded once", async () => {
    let loads = 0;
    const bundle = new MemoryBundleSource({ "index.md": "# X\n" });
    const bundles = oneBundleForEveryKey(async () => {
      loads += 1;
      return bundle;
    });
    const sources = await Promise.all([
      bundles.forKey({}),
      bundles.forKey({ tenant: "t1", locale: "de" }),
      bundles.forKey({ tenant: "t2", locale: "en" }),
    ]);
    expect(sources.every((source) => source === bundle)).toBe(true);
    expect(loads).toBe(1);
  });

  test("a failed load is shared too, so every request fails the same way", async () => {
    const bundles = oneBundleForEveryKey(() => Promise.reject(new Error("no model")));
    await expect(bundles.forKey({ tenant: "t1" })).rejects.toThrow("no model");
    await expect(bundles.forKey({})).rejects.toThrow("no model");
  });
});
