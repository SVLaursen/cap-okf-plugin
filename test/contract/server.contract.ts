// The server contract (task 4.1): what every channel that serves the bundle must do, whatever
// its protocol. Each channel runs it through a small adapter: the static route now (4.3), the MCP
// tools channel (4.5) and the MCP resources channel (4.6) later.
//
// The contract, from docs/PLAN.md 4.1 and ADR-0003, ADR-0007, ADR-0010:
// - it lists concepts, and every concept it lists can be read;
// - it reads a concept as the bundle has it;
// - an unknown path, or one that tries to leave the bundle, is not found;
// - an unauthenticated reader never gets an authorization section; an authenticated one does;
// - it serves nothing when it is turned off (disabledContract);
// - where a channel has `requires` (MCP, ADR-0010), a caller who doesn't meet it gets the same
//   not-found answer for a real path as for an unknown one (hiddenContract).
//
// Assertions compare { path, … } objects, so a failure names the path that broke.

/**
 * Who is asking: no user; a user CAP has authenticated; or an authenticated user who doesn't
 * meet the channel's `requires` (MCP channels, ADR-0010).
 */
export type Reader = "anonymous" | "authenticated" | "without-required-role";

/** A channel's answer to a read: the text, or its not-found answer as the caller sees it. */
export type Answer = { text: string } | { notFound: string };

/** What a channel adapter offers the contract. */
export interface Channel {
  /** Paths of the concepts the channel offers this reader, e.g. "model/CatalogService/Books.md". */
  list(reader: Reader): Promise<string[]>;
  /** A file as the reader gets it. */
  read(path: string, reader: Reader): Promise<Answer>;
}

/** What the contract expects to find in the app the channel serves. */
export interface Expected {
  /** The reader who may list and read: "anonymous" for the static route; MCP requires a user. */
  reader: Reader;
  /** A generated concept and a bit of its text. */
  concept: { path: string; contains: string };
  /** A curated concept from okf/. */
  curated: string;
  /** Concepts with an authorization section: a generated one and a curated one. */
  withAuthSection: string[];
}

const MARKER = /okf:auth:(start|end)/;

function textOf(answer: Answer): string | undefined {
  return "text" in answer ? answer.text : undefined;
}

/**
 * Registers the contract's tests for one channel. `channel` is called inside the tests, so the
 * adapter may depend on an app that cds.test starts.
 */
export function serverContract(name: string, channel: () => Channel, expected: Expected): void {
  describe(`server contract: ${name}`, () => {
    test("lists concepts, generated and curated, and can read every one it lists", async () => {
      const listed = await channel().list(expected.reader);
      expect(listed).toEqual(expect.arrayContaining([expected.concept.path, expected.curated]));
      for (const path of listed) {
        const found = textOf(await channel().read(path, expected.reader)) !== undefined;
        expect({ path, found }).toEqual({ path, found: true });
      }
    });

    test("reads a concept as the bundle has it", async () => {
      const text = textOf(await channel().read(expected.concept.path, expected.reader));
      expect(text).toMatch(/^---\n[\s\S]*\n---\n/);
      expect(text).toContain(expected.concept.contains);
    });

    test("an unknown path, or one that leaves the bundle, is not found", async () => {
      const paths = ["nope.md", "model/Nope.md", "../package.json", "model/../../package.json"];
      for (const path of paths) {
        const text = textOf(await channel().read(path, "authenticated"));
        expect({ path, text }).toEqual({ path, text: undefined });
      }
    });

    test("an unauthenticated reader never gets an authorization section", async () => {
      for (const path of [
        ...(await channel().list(expected.reader)),
        ...expected.withAuthSection,
      ]) {
        const text = textOf(await channel().read(path, "anonymous")) ?? "";
        expect({ path, marker: MARKER.test(text) }).toEqual({ path, marker: false });
      }
    });

    test("an authenticated reader gets the authorization sections", async () => {
      for (const path of expected.withAuthSection) {
        const text = textOf(await channel().read(path, "authenticated")) ?? "";
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
      for (const path of ["index.md", somePath]) {
        const text = textOf(await channel().read(path, "authenticated"));
        expect({ path, text }).toEqual({ path, text: undefined });
      }
    });
  });
}

/**
 * Registers the contract's test for a channel with `requires` (MCP, ADR-0010): a caller who
 * doesn't meet it can't tell a real path from an unknown one.
 */
export function hiddenContract(name: string, channel: () => Channel, realPath: string): void {
  describe(`server contract: ${name}, caller without the required role`, () => {
    test("gets the same not-found answer for a real path as for an unknown one", async () => {
      const hidden = await channel().read(realPath, "without-required-role");
      const unknown = await channel().read("nope.md", "without-required-role");
      expect(hidden).toEqual(unknown);
      expect("notFound" in hidden).toBe(true);
    });
  });
}
