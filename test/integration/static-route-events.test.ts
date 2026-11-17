import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import { registerServing } from "../../src/serve/serving";

// Task 4.3 review: the bundle is ready before `served` completes (ADR-0007), each server gets its
// own bundle, a setup error stops startup, and a curated file that isn't text isn't served.

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

interface Served {
  served(): Promise<unknown>;
  get(url: string): Promise<{ status: number; body: string }>;
}

/** A stand-in for cds with its own event emitter, for one app at `root`. */
async function server(root: string): Promise<Served> {
  const events = new EventEmitter();
  const listeners: Record<string, ((arg?: unknown) => unknown)[]> = {};
  const fake = Object.create(cds, {
    root: { value: root },
    model: { value: await cds.load(path.join(root, "srv")) },
    env: { value: Object.create(cds.env, { okf: { value: { serve: { static: true } } } }) },
    context: { value: undefined },
    middlewares: { value: { before: [] } },
    on: {
      value: (event: string, listener: (arg?: unknown) => unknown) => {
        (listeners[event] ??= []).push(listener);
        events.on(event, listener);
      },
    },
  });
  registerServing(fake);
  let handler: ((req: unknown, res: unknown, next: (e: unknown) => void) => void) | undefined;
  for (const listener of listeners["bootstrap"] ?? [])
    listener({ use: (_route: string, _before: unknown, h: typeof handler) => (handler = h) });
  return {
    served: () => Promise.all((listeners["served"] ?? []).map((listener) => listener())),
    get: (url) =>
      new Promise((resolve, reject) => {
        const res = {
          statusCode: 200,
          set() {
            return res;
          },
          status(code: number) {
            res.statusCode = code;
            return res;
          },
          end() {
            resolve({ status: res.statusCode, body: "" });
          },
          send(body: string) {
            resolve({ status: res.statusCode, body });
          },
          redirect(code: number) {
            resolve({ status: code, body: "" });
          },
        };
        handler!({ method: "GET", path: url, originalUrl: `/okf${url}` }, res, reject);
      }),
  };
}

const roots: string[] = [];

/** A copy of the bookshop fixture, removed after the tests. */
function app(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-route-"));
  fs.cpSync(FIXTURE, root, { recursive: true });
  roots.push(root);
  return root;
}

afterAll(() => roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

describe("the static route's startup", () => {
  test("served waits until the bundle is ready (ADR-0007)", async () => {
    const root = app();
    fs.mkdirSync(path.join(root, "okf-bundle"));
    fs.writeFileSync(path.join(root, "okf-bundle", "index.md"), "# Built\n");
    const s = await server(root);
    const results = await s.served();
    expect(results).toHaveLength(1);
    expect(await s.get("/index.md")).toEqual({ status: 200, body: "# Built\n" });
  });

  test("each server serves its own app's bundle", async () => {
    const first = app();
    const second = app();
    for (const [root, text] of [
      [first, "# First\n"],
      [second, "# Second\n"],
    ] as const) {
      fs.mkdirSync(path.join(root, "okf-bundle"));
      fs.writeFileSync(path.join(root, "okf-bundle", "index.md"), text);
    }
    const a = await server(first);
    const b = await server(second);
    expect((await a.get("/index.md")).body).toBe("# First\n");
    expect((await b.get("/index.md")).body).toBe("# Second\n");
  });

  test("a setup error stops startup instead of leaving a route that always fails", async () => {
    const root = app();
    fs.writeFileSync(path.join(root, "okf"), "a file, not a folder\n");
    const s = await server(root);
    await expect(s.served()).rejects.toThrow(/^\[okf\] okf — is a file, not a folder\./);
  });
});

describe("the static route and files that aren't text", () => {
  test("a curated file that isn't text isn't served", async () => {
    const root = app();
    fs.mkdirSync(path.join(root, "okf"));
    fs.writeFileSync(path.join(root, "okf", "logo.png"), Buffer.from([0x89, 0x50, 0xff, 0xfe]));
    fs.writeFileSync(path.join(root, "okf", "q.sql"), "select 1;\n");
    const s = await server(root);
    await s.served();
    expect((await s.get("/logo.png")).status).toBe(404);
    expect(await s.get("/q.sql")).toEqual({ status: 200, body: "select 1;\n" });
  });

  test("a built bundle's file that isn't UTF-8 text isn't served either", async () => {
    const root = app();
    fs.mkdirSync(path.join(root, "okf-bundle"));
    fs.writeFileSync(
      path.join(root, "okf-bundle", "logo.png"),
      Buffer.from([0x89, 0x50, 0xff, 0xfe]),
    );
    const s = await server(root);
    await s.served();
    expect((await s.get("/logo.png")).status).toBe(404);
  });
});

// Review of 4.5 step 2b: the MCP selector runs at bootstrap; a setup mistake stops the server
// with the [okf] message and no stack, and its warnings are logged once.
describe("serving's startup and the MCP settings", () => {
  function bootstrap(okf: object, plugins: object = {}) {
    const listeners: Record<string, ((arg?: unknown) => unknown)[]> = {};
    const warnings: string[] = [];
    const fake = Object.create(cds, {
      root: { value: app() },
      env: { value: Object.create(cds.env, { okf: { value: okf }, plugins: { value: plugins } }) },
      log: { value: () => ({ warn: (message: string) => warnings.push(message) }) },
      on: {
        value: (event: string, listener: (arg?: unknown) => unknown) =>
          (listeners[event] ??= []).push(listener),
      },
    });
    registerServing(fake);
    const start = () =>
      (listeners["bootstrap"] ?? []).forEach((listener) => listener({ use: () => undefined }));
    return { start, warnings };
  }

  test("a setup mistake stops the server with the [okf] message, no stack", () => {
    const { start } = bootstrap({ serve: { mcp: { plugin: "nope" } } }, { "@gavdi/cap-mcp": {} });
    let thrown: Error | undefined;
    try {
      start();
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toMatch(/^\[okf\] cds\.okf\.serve\.mcp\.plugin — /);
    expect(thrown?.stack).toBe(thrown?.message);
  });

  test("selector warnings are logged once", () => {
    const { start, warnings } = bootstrap({ serve: { mcp: true } });
    start();
    expect(warnings).toEqual([
      expect.stringMatching(
        /^\[okf\] cds\.okf\.serve\.mcp — is on, but no MCP plugin is installed/,
      ),
    ]);
  });
});
