// The server contract (task 4.1): what every channel that serves the bundle must do, whatever
// its protocol. Each channel runs it through a small adapter: the static route now (4.3), the MCP
// tools channel (4.5) and the MCP resources channel (4.6) later.
//
// The contract, from docs/PLAN.md 4.1 and ADR-0003, ADR-0007, ADR-0010:
// - it lists concepts, and every concept it lists can be read;
// - it reads a concept as the bundle has it;
// - an unknown path, or one that tries to leave the bundle, is not found;
// - an unauthenticated reader never gets an authorization section; an authenticated one does;
// - it serves nothing when it is turned off.

/** Who is asking: no user, or a user CAP has authenticated. */
export type Reader = "anonymous" | "authenticated";

/** What a channel adapter offers the contract. */
export interface Channel {
  /** Paths of the concepts the channel offers this reader, e.g. "model/CatalogService/Books.md". */
  list(reader: Reader): Promise<string[]>;
  /** A file's text as the reader gets it, or undefined when the channel says "not found". */
  read(path: string, reader: Reader): Promise<string | undefined>;
}

/** What the contract expects to find in the app the channel serves. */
export interface Expected {
  /** A generated concept and a bit of its text. */
  concept: { path: string; contains: string };
  /** A curated concept from okf/. */
  curated: string;
  /** Concepts with an authorization section: a generated one and a curated one. */
  withAuthSection: string[];
}

const MARKER = /okf:auth:(start|end)/;

/**
 * Registers the contract's tests for one channel. `channel` is called inside the tests, so the
 * adapter may depend on an app that cds.test starts.
 */
export function serverContract(name: string, channel: () => Channel, expected: Expected): void {
  describe(`server contract: ${name}`, () => {
    test("lists concepts, generated and curated, and can read every one it lists", async () => {
      const listed = await channel().list("anonymous");
      expect(listed).toEqual(expect.arrayContaining([expected.concept.path, expected.curated]));
      for (const path of listed) {
        expect({ path, found: (await channel().read(path, "anonymous")) !== undefined }).toEqual({
          path,
          found: true,
        });
      }
    });

    test("reads a concept as the bundle has it", async () => {
      const text = await channel().read(expected.concept.path, "anonymous");
      expect(text).toMatch(/^---\n[\s\S]*\n---\n/);
      expect(text).toContain(expected.concept.contains);
    });

    test("an unknown path, or one that leaves the bundle, is not found", async () => {
      for (const path of [
        "nope.md",
        "model/Nope.md",
        "../package.json",
        "model/../../package.json",
      ]) {
        expect({ path, text: await channel().read(path, "authenticated") }).toEqual({
          path,
          text: undefined,
        });
      }
    });

    test("an unauthenticated reader never gets an authorization section", async () => {
      for (const path of await channel().list("anonymous")) {
        const text = (await channel().read(path, "anonymous")) ?? "";
        expect({ path, marker: MARKER.test(text) }).toEqual({ path, marker: false });
      }
    });

    test("an authenticated reader gets the authorization sections", async () => {
      for (const path of expected.withAuthSection) {
        const text = (await channel().read(path, "authenticated")) ?? "";
        expect({ path, marker: MARKER.test(text) }).toEqual({ path, marker: true });
      }
    });
  });
}

/** Registers the contract's test for a channel that is turned off. */
export function disabledContract(name: string, channel: () => Channel, somePath: string): void {
  describe(`server contract: ${name}, turned off`, () => {
    test("serves nothing", async () => {
      expect(await channel().list("authenticated")).toEqual([]);
      expect(await channel().read("index.md", "authenticated")).toBeUndefined();
      expect(await channel().read(somePath, "authenticated")).toBeUndefined();
    });
  });
}
