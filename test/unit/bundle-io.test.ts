import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Concept } from "../../src/core/concept";
import { isBundlePath } from "../../src/bundle/paths";
import {
  FileBundleSink,
  MemoryBundleSink,
  writeConcept,
  type BundleSink,
} from "../../src/bundle/sink";
import { FileBundleSource, MemoryBundleSource, type BundleSource } from "../../src/bundle/source";

// Every server reads a bundle through BundleSource, and the build writes one through BundleSink
// (CLAUDE.md, ADR-0007). The in-memory and the file versions must behave the same, so one
// contract suite runs against both.

const temporaryFolders: string[] = [];

function newFolder(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-bundle-"));
  temporaryFolders.push(folder);
  return folder;
}

afterAll(() => {
  for (const folder of temporaryFolders) fs.rmSync(folder, { recursive: true, force: true });
});

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [filePath, text] of Object.entries(files)) {
    const fullPath = path.join(root, ...filePath.split("/"));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, text, "utf8");
  }
}

interface SourceKind {
  name: string;
  create(files: Record<string, string>): BundleSource;
}

interface SinkKind {
  name: string;
  /** A new, empty sink, and a way to read back what was written to it. */
  create(): { sink: BundleSink; readBack(): BundleSource };
}

const SOURCE_KINDS: SourceKind[] = [
  { name: "MemoryBundleSource", create: (files) => new MemoryBundleSource(files) },
  {
    name: "FileBundleSource",
    create: (files) => {
      const root = newFolder();
      writeFiles(root, files);
      return new FileBundleSource(root);
    },
  },
];

const SINK_KINDS: SinkKind[] = [
  {
    name: "MemoryBundleSink",
    create: () => {
      const sink = new MemoryBundleSink();
      return { sink, readBack: () => sink.toSource() };
    },
  },
  {
    name: "FileBundleSink",
    create: () => {
      const root = newFolder();
      return { sink: new FileBundleSink(root), readBack: () => new FileBundleSource(root) };
    },
  },
];

const BUNDLE = {
  "index.md": "# Guides\n\n* [Ordering](guides/ordering.md)\n",
  "guides/ordering.md": "---\ntype: Playbook\n---\n\nÄrger mit Bestellungen? Siehe unten.\r\n",
  "guides/returns.md": "---\ntype: Policy\n---\n",
  "references/attesters/revenue.py": "def attest():\n    return True\n",
  "Zeta.md": "---\ntype: X\n---\n",
  "guides/\u00c4rger.md": "---\ntype: FAQ\n---\n",
};

/** "Ärger" with Ä as A plus a combining diaeresis (NFD), as macOS HFS+ used to store names. */
const ARGER_NFD = "guides/A\u0308rger.md";

describe.each(SOURCE_KINDS)("BundleSource contract: $name", ({ create }) => {
  test("lists every file, sorted by code unit, with / separators", async () => {
    expect(await create(BUNDLE).list()).toEqual([
      "Zeta.md",
      "guides/ordering.md",
      "guides/returns.md",
      "guides/\u00c4rger.md",
      "index.md",
      "references/attesters/revenue.py",
    ]);
  });

  test("reads a non-ASCII path only in the Unicode form it is listed in", async () => {
    const source = create(BUNDLE);
    expect(await source.read("guides/\u00c4rger.md")).toBe("---\ntype: FAQ\n---\n");
    expect(await source.read(ARGER_NFD)).toBeUndefined();
  });

  test("reads each file's text exactly as written", async () => {
    const source = create(BUNDLE);
    for (const [filePath, text] of Object.entries(BUNDLE)) {
      expect(await source.read(filePath)).toBe(text);
    }
  });

  test("an empty bundle lists nothing", async () => {
    expect(await create({}).list()).toEqual([]);
  });

  test("reading a path that is not in the bundle gives undefined", async () => {
    const source = create(BUNDLE);
    expect(await source.read("guides/missing.md")).toBeUndefined();
    expect(await source.read("guides")).toBeUndefined();
  });

  test.each([
    "../outside.md",
    "/index.md",
    "guides/../index.md",
    "./index.md",
    "guides//ordering.md",
    "guides\\ordering.md",
    "",
    ".hidden.md",
  ])("reading the unsafe path %j gives undefined", async (unsafePath) => {
    expect(await create(BUNDLE).read(unsafePath)).toBeUndefined();
  });

  test("changing the listed array does not change the bundle", async () => {
    const source = create(BUNDLE);
    (await source.list()).pop();
    expect(await source.list()).toHaveLength(6);
  });
});

describe.each(SINK_KINDS)("BundleSink contract: $name", ({ create }) => {
  test("what is written can be listed and read back", async () => {
    const { sink, readBack } = create();
    await sink.write("model/demo/Books.md", "---\ntype: Entity\n---\n");
    await sink.write("index.md", "# Model\n");
    expect(await readBack().list()).toEqual(["index.md", "model/demo/Books.md"]);
    expect(await readBack().read("model/demo/Books.md")).toBe("---\ntype: Entity\n---\n");
  });

  test("writing a path again replaces its text", async () => {
    const { sink, readBack } = create();
    await sink.write("a.md", "first\n");
    await sink.write("a.md", "second\n");
    expect(await readBack().read("a.md")).toBe("second\n");
  });

  test.each(["../outside.md", "/abs.md", "a/../b.md", "", ".git/config"])(
    "writing the unsafe path %j is rejected",
    async (unsafePath) => {
      const { sink, readBack } = create();
      await expect(sink.write(unsafePath, "x")).rejects.toThrow(/ — not a bundle path\./);
      expect(await readBack().list()).toEqual([]);
    },
  );
});

describe.each(SINK_KINDS)("BundleSink contract, portable paths: $name", ({ create }) => {
  // A bundle must work on every file system, and on macOS and Windows these name one file.
  test.each([
    ["letter case", "guides/a.md", "guides/A.md"],
    ["letter case of a folder", "Guides/a.md", "guides/b.md"],
    ["Unicode form", "guides/\u00c4rger.md", ARGER_NFD],
  ])(
    "a path differing from an earlier one only in %s is rejected",
    async (_label, first, second) => {
      const { sink, readBack } = create();
      await sink.write(first, "first\n");
      await expect(sink.write(second, "second\n")).rejects.toThrow(
        /differs from .* only in letter case or Unicode form/,
      );
      expect(await readBack().list()).toEqual([first]);
      expect(await readBack().read(first)).toBe("first\n");
    },
  );

  // Windows strips a trailing dot or space and reads "a.md:x" as a hidden stream of a.md.
  test.each(["a.md:stream", "notes./a.md", "a.md "])(
    "writing the path %j, which Windows can't store as written, is rejected",
    async (path) => {
      await expect(create().sink.write(path, "x")).rejects.toThrow(
        /can't be stored on every file system/,
      );
    },
  );

  test("writeConcept writes the serialized concept at its path", async () => {
    const { sink, readBack } = create();
    const concept: Concept = {
      path: "guides/a.md",
      id: "guides/a",
      frontmatter: { title: "A", type: "Playbook" },
      body: "\n# A\n",
    };
    await writeConcept(sink, concept);
    expect(await readBack().read("guides/a.md")).toBe(
      "---\ntype: Playbook\ntitle: A\n---\n\n# A\n",
    );
  });
});

describe("isBundlePath", () => {
  test.each(["index.md", "model/demo/Books.md", "a%3Ab.md", "notes (draft).md", "ä/ö.md"])(
    "%j is a bundle path",
    (bundlePath) => {
      expect(isBundlePath(bundlePath)).toBe(true);
    },
  );

  test.each([
    "",
    "/a.md",
    "a/",
    "a//b.md",
    "./a.md",
    "a/./b.md",
    "../a.md",
    "a/../b.md",
    "a\\b.md",
    ".env",
    "a/.git/x",
    "a\u0000b.md",
  ])("%j is not a bundle path", (notBundlePath) => {
    expect(isBundlePath(notBundlePath)).toBe(false);
  });
});

describe("MemoryBundleSource and MemoryBundleSink", () => {
  test("rejects a path that is not a bundle path when it is created", () => {
    expect(() => new MemoryBundleSource({ "../x.md": "x" })).toThrow(/not a bundle path/);
  });

  test("keeps its own copy of the files it was given", async () => {
    const files: Record<string, string> = { "a.md": "a" };
    const source = new MemoryBundleSource(files);
    files["b.md"] = "b";
    files["a.md"] = "changed";
    expect(await source.list()).toEqual(["a.md"]);
    expect(await source.read("a.md")).toBe("a");
  });

  // Unlike a FileBundleSource on the sink's folder, which always shows the folder as it is now.
  test("toSource() is a snapshot: later writes don't show up in it", async () => {
    const sink = new MemoryBundleSink();
    await sink.write("a.md", "a");
    const snapshot = sink.toSource();
    await sink.write("b.md", "b");
    expect(await snapshot.list()).toEqual(["a.md"]);
  });
});

describe("FileBundleSource on disk (ADR-0007)", () => {
  test("skips dotfiles and dot-folders", async () => {
    const root = newFolder();
    writeFiles(root, { "a.md": "a", ".DS_Store": "x", ".git/config": "x", "sub/.hidden.md": "x" });
    expect(await new FileBundleSource(root).list()).toEqual(["a.md"]);
  });

  test("does not list or read through symbolic links", async () => {
    const root = newFolder();
    const outside = newFolder();
    writeFiles(root, { "a.md": "a" });
    writeFiles(outside, { "secret.md": "secret" });
    fs.symlinkSync(path.join(outside, "secret.md"), path.join(root, "link.md"));
    fs.symlinkSync(outside, path.join(root, "linked-folder"), "dir");
    const source = new FileBundleSource(root);
    expect(await source.list()).toEqual(["a.md"]);
    expect(await source.read("link.md")).toBeUndefined();
    expect(await source.read("linked-folder/secret.md")).toBeUndefined();
  });

  test("a missing root folder is an empty bundle", async () => {
    const source = new FileBundleSource(path.join(newFolder(), "does-not-exist"));
    expect(await source.list()).toEqual([]);
    expect(await source.read("a.md")).toBeUndefined();
  });

  // Only "nothing there" means an empty bundle; any other problem must surface, not hide files.
  test("a root that can't be resolved, such as a symbolic link loop, is an error", async () => {
    const folder = newFolder();
    fs.symlinkSync(path.join(folder, "b"), path.join(folder, "a"));
    fs.symlinkSync(path.join(folder, "a"), path.join(folder, "b"));
    const source = new FileBundleSource(path.join(folder, "a"));
    await expect(source.list()).rejects.toThrow(/ELOOP/);
    await expect(source.read("x.md")).rejects.toThrow(/ELOOP/);
  });
});

describe("FileBundleSource on disk, root and spelling", () => {
  test("a root that is a file, not a folder, is an error for list and read alike", async () => {
    const folder = newFolder();
    writeFiles(folder, { "file.md": "x" });
    const source = new FileBundleSource(path.join(folder, "file.md"));
    await expect(source.list()).rejects.toThrow(/is not a folder/);
    await expect(source.read("x.md")).rejects.toThrow(/is not a folder/);
  });

  // On case-insensitive file systems (macOS, Windows) Index.MD would open index.md, but only
  // the listed spelling may be read.
  test("reads a path only in the spelling it is listed in", async () => {
    const root = newFolder();
    writeFiles(root, { "index.md": "x" });
    expect(await new FileBundleSource(root).read("Index.MD")).toBeUndefined();
  });

  test("works when the root folder itself is reached through a symbolic link", async () => {
    const real = newFolder();
    writeFiles(real, { "a.md": "a" });
    const link = path.join(newFolder(), "bundle");
    fs.symlinkSync(real, link, "dir");
    const source = new FileBundleSource(link);
    expect(await source.list()).toEqual(["a.md"]);
    expect(await source.read("a.md")).toBe("a");
  });
});

describe("FileBundleSink on disk", () => {
  test("refuses to write into a folder that is a symbolic link", async () => {
    const root = newFolder();
    const outside = newFolder();
    fs.symlinkSync(outside, path.join(root, "linked-folder"), "dir");
    const sink = new FileBundleSink(root);
    await expect(sink.write("linked-folder/a.md", "x")).rejects.toThrow(
      /linked-folder — is a symbolic link, so linked-folder\/a\.md can't be written\./,
    );
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  test("replaces a symbolic link at the file's place instead of writing through it", async () => {
    const root = newFolder();
    const outside = newFolder();
    writeFiles(outside, { "target.md": "outside" });
    fs.symlinkSync(path.join(outside, "target.md"), path.join(root, "link.md"));
    await new FileBundleSink(root).write("link.md", "inside");
    expect(fs.readFileSync(path.join(outside, "target.md"), "utf8")).toBe("outside");
    expect(fs.lstatSync(path.join(root, "link.md")).isSymbolicLink()).toBe(false);
    expect(await new FileBundleSource(root).read("link.md")).toBe("inside");
  });

  test("creates no folder outside its own when a write through a link is refused", async () => {
    const root = newFolder();
    const outside = newFolder();
    fs.symlinkSync(outside, path.join(root, "linked-folder"), "dir");
    const sink = new FileBundleSink(root);
    await expect(sink.write("linked-folder/new/sub/a.md", "x")).rejects.toThrow(/symbolic link/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});

describe("FileBundleSink on disk, links and files in the way", () => {
  test("replacing a file breaks a hard link instead of changing the other file", async () => {
    const root = newFolder();
    const outside = newFolder();
    writeFiles(outside, { "secret.txt": "secret" });
    fs.linkSync(path.join(outside, "secret.txt"), path.join(root, "h.md"));
    await new FileBundleSink(root).write("h.md", "overwritten");
    expect(fs.readFileSync(path.join(outside, "secret.txt"), "utf8")).toBe("secret");
    expect(fs.readFileSync(path.join(root, "h.md"), "utf8")).toBe("overwritten");
  });

  test("a file where a folder is needed is an error, and leaves no temporary file", async () => {
    const root = newFolder();
    writeFiles(root, { guides: "a file", "a/b.md/keep.md": "x" });
    const sink = new FileBundleSink(root);
    await expect(sink.write("guides/a.md", "x")).rejects.toThrow(/is a file, not a folder/);
    await expect(sink.write("a/b.md", "x")).rejects.toThrow();
    expect(fs.readdirSync(path.join(root, "a"))).toEqual(["b.md"]);
  });

  test("creates its root folder when it does not exist yet", async () => {
    const root = path.join(newFolder(), "gen", "okf");
    await new FileBundleSink(root).write("a.md", "a");
    expect(fs.readFileSync(path.join(root, "a.md"), "utf8")).toBe("a");
  });
});
