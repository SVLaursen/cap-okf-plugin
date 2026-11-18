import path from "node:path";
import cds from "@sap/cds";
import { MCP_PLUGIN_STUB } from "../helpers/gavdi";

// Task 4.5 step 2b (ADR-0010 Contract B, ADR-0011): OkfService's handlers on the demo app, with
// "@gavdi/cap-mcp" in the plugin list (an empty stub: the tools are called in-process here, as
// the plugin calls them, through cds.services.OkfService) and `requires: "any"`, so anonymous
// readers can use it and the ADR-0003 filter shows.

const config = JSON.parse(process.env["CDS_CONFIG"] ?? "{}") as { plugins?: object };
process.env["CDS_CONFIG"] = JSON.stringify({
  ...config,
  plugins: { ...config.plugins, "@gavdi/cap-mcp": { impl: MCP_PLUGIN_STUB } },
  okf: { serve: { mcp: { as: ["tools"], requires: "any" } } },
});

const DEMO = path.join(__dirname, "..", "..", "demo");
const { GET, axios } = cds.test(DEMO);
axios.defaults.validateStatus = () => true;

const ANONYMOUS = cds.User.anonymous;
const BOB = new cds.User("bob");

type Service = {
  tx<T>(
    context: object,
    run: (tx: {
      run(q: unknown): Promise<T>;
      send(event: string, data?: object): Promise<T>;
    }) => Promise<T>,
  ): Promise<T>;
};
const okf = () => (cds.services as unknown as Record<string, Service>)["OkfService"]!;
const read = (user: unknown, query: unknown) => okf().tx({ user }, (tx) => tx.run(query));
const send = (user: unknown, event: string, data: object = {}) =>
  okf().tx({ user }, (tx) => tx.send(event, data));

const INDEX = { ref: ["OkfService.Index"] };
const ORDERS = "model/AdminService/Orders.md";

describe("OkfService.Index", () => {
  test("lists the concepts with their metadata, never their text", async () => {
    const rows = (await read(ANONYMOUS, { SELECT: { from: INDEX } })) as { path: string }[];
    expect(rows.map((row) => row.path)).toEqual(
      expect.arrayContaining(["guides/ordering.md", ORDERS]),
    );
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "description",
      "links",
      "path",
      "tags",
      "title",
      "type",
    ]);
  });

  test("answers the count query and the get tool", async () => {
    const count = await read(ANONYMOUS, {
      SELECT: {
        one: true,
        from: INDEX,
        columns: [{ func: "count", args: ["*"], as: "total" }],
        where: [{ ref: ["type"] }, "=", { val: "Playbook" }],
      },
    });
    expect(count).toEqual({ total: 1 });
    const one = await read(ANONYMOUS, {
      SELECT: {
        one: true,
        from: {
          ref: [
            {
              id: "OkfService.Index",
              where: [{ ref: ["path"] }, "=", { val: "guides/ordering.md" }],
            },
          ],
        },
      },
    });
    expect(one).toMatchObject({ path: "guides/ordering.md", type: "Playbook" });
  });
});

describe("OkfService.Index: links and refusals", () => {
  // ADR-0003: a link that sits only inside an authorization section isn't listed for readers who
  // don't see that section.
  test("links names only concepts the reader can reach in the text they get", async () => {
    const links = async (user: unknown) => {
      const row = (await read(user, {
        SELECT: {
          one: true,
          from: {
            ref: [{ id: "OkfService.Index", where: [{ ref: ["path"] }, "=", { val: ORDERS }] }],
          },
        },
      })) as { links: string | null };
      return (row.links ?? "").split(",");
    };
    expect(await links(BOB)).toContain("model/AdminService.md");
    expect(await links(ANONYMOUS)).not.toContain("model/AdminService.md");
  });

  test("a query it doesn't support is a 400 with the [okf] message", async () => {
    await expect(
      read(ANONYMOUS, { SELECT: { from: INDEX, groupBy: [{ ref: ["type"] }] } }),
    ).rejects.toMatchObject({
      code: 400,
      message: expect.stringMatching(/^\[okf\] OkfService\.Index — groupBy isn't supported/),
    });
  });
});

describe("OkfService functions", () => {
  test("getConcept returns the concept, without the authorization section for anonymous readers", async () => {
    const anonymous = (await send(ANONYMOUS, "getConcept", { path: ORDERS })) as string;
    const bob = (await send(BOB, "getConcept", { path: ORDERS })) as string;
    expect(anonymous).toMatch(/^---\n/);
    expect(anonymous).not.toContain("okf:auth");
    expect(bob).toContain("<!-- okf:auth:start -->");
  });

  test.each(["nope.md", "../package.json", "model/../../package.json"])(
    "getConcept(%j) is a 404",
    async (conceptPath) => {
      await expect(send(BOB, "getConcept", { path: conceptPath })).rejects.toMatchObject({
        code: 404,
      });
    },
  );

  test("getConcept with path and paths: each once, path first, under a line naming it", async () => {
    const text = (await send(BOB, "getConcept", {
      path: "guides/ordering.md",
      paths: [ORDERS, "guides/ordering.md", "nope.md"],
    })) as string;
    const marks = [...text.matchAll(/^<!-- okf:concept (.+) -->$/gm)].map((match) => match[1]);
    expect(marks).toEqual(["guides/ordering.md", ORDERS, "nope.md"]);
    expect(text).toContain("[okf] nope.md — isn't a file of the bundle.");
  });

  test("getConcept with paths alone, even one, uses the marked form; none at all is a 400", async () => {
    expect(await send(BOB, "getConcept", { paths: [ORDERS] })).toMatch(
      new RegExp(`^<!-- okf:concept ${ORDERS} -->\\n---\\n`),
    );
    await expect(send(BOB, "getConcept", {})).rejects.toMatchObject({ code: 400 });
    await expect(send(BOB, "getConcept", { paths: [] })).rejects.toMatchObject({ code: 400 });
  });

  test("getConcept with more than five paths is a 400", async () => {
    const paths = ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"];
    await expect(send(BOB, "getConcept", { paths })).rejects.toMatchObject({ code: 400 });
  });

  test("searchConcepts finds Index rows by words", async () => {
    const rows = (await send(ANONYMOUS, "searchConcepts", { text: "placing order" })) as {
      path: string;
    }[];
    expect(rows.map((row) => row.path)).toContain("guides/ordering.md");
  });

  test("bundleInfo gives the OKF version, the bundle's hash and the namespace", async () => {
    expect(await send(ANONYMOUS, "bundleInfo")).toEqual({
      okfVersion: "0.2",
      bundleHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      namespace: "cap-okf-demo",
    });
  });
});

describe("OkfService is reached through the MCP plugin only", () => {
  // With @gavdi/cap-mcp, @mcp is no protocol, so OkfService would also be on OData; cap-okf
  // marks it @protocol: 'none' (ADR-0006, ADR-0010).
  test("it has no OData endpoint", async () => {
    expect((await GET("/odata/v4/okf-service/Index")).status).toBe(404);
    expect(cds.model!.definitions["OkfService"]?.["@protocol"]).toBe("none");
    // Only the OData endpoint goes: the MCP plugin calls the service itself.
    expect((cds.services as unknown as Record<string, unknown>)["OkfService"]).toBeDefined();
  });
});
