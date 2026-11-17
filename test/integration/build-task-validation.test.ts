import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cds from "@sap/cds";
import type { Finding } from "../../src/core/finding";
import { validateBundle } from "../../src/core/validate";
import { registerBuildTask } from "../../src/build/build-task";

// Task 2.9: the build fails only on validation errors. The exporter never makes an invalid
// bundle, so the validator is stubbed here, and the okf build plugin runs in-process on CAP's
// own build plugin base class.

jest.mock("../../src/core/validate", () => ({ validateBundle: jest.fn() }));

const FIXTURE = path.join(__dirname, "..", "fixtures", "bookshop");

const WARNING: Finding = {
  file: "model/x/A.md",
  line: 2,
  rule: "W1",
  severity: "warning",
  message: "the recommended description is missing",
  fix: "Add description: to the frontmatter",
};
const ERROR: Finding = { ...WARNING, rule: "R2", severity: "error", message: '"type" is empty' };

interface PluginUnderTest {
  _task: unknown;
  _context: unknown;
  init(): void;
  build(): Promise<void>;
  messages: { message: string; severity: string }[];
}

/** The okf build plugin as `cds build` makes it: registered, then given its task and context. */
function okfPlugin(out: string): PluginUnderTest {
  // cds.build exists only while `cds build` runs; here it is cds-dk's build module itself.
  const dkBuild = jest.requireActual<object>("@sap/cds-dk/lib/build");
  let registered: (new () => PluginUnderTest) | undefined;
  const register = (_id: string, plugin: new () => PluginUnderTest) => (registered = plugin);
  registerBuildTask(Object.create(cds, { build: { value: { ...dkBuild, register } } }));
  const plugin = new registered!();
  plugin._task = { for: "okf", src: FIXTURE, dest: out, options: { model: [FIXTURE] } };
  plugin._context = {
    options: {},
    tasks: [{ for: "nodejs", src: FIXTURE, dest: path.join(out, "srv") }],
  };
  plugin.init();
  return plugin;
}

describe("the okf build task and validation findings", () => {
  let out: string;

  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), "cap-okf-build-validation-"));
  });
  afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

  test("warnings are reported and the build succeeds", async () => {
    jest.mocked(validateBundle).mockReturnValue([WARNING]);
    const plugin = okfPlugin(out);
    await plugin.build();
    expect(plugin.messages).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^\[okf\] model\/x\/A\.md:2 — /),
        severity: "Warning",
      }),
    ]);
    expect(fs.existsSync(path.join(out, "srv", "okf-bundle", "index.md"))).toBe(true);
  });

  test("an error fails the build, listed, and the bundle is not put into the deployed app", async () => {
    jest.mocked(validateBundle).mockReturnValue([ERROR, WARNING]);
    const plugin = okfPlugin(out);
    const failure = plugin.build();
    await expect(failure).rejects.toThrow(/\[okf\] .* — the bundle breaks OKF v0\.2 in 1 place/);
    await expect(failure).rejects.toMatchObject({
      name: "BuildError",
      messages: [expect.stringMatching(/^\[okf\] model\/x\/A\.md:2 — "type" is empty \(R2\)/)],
    });
    // gen/okf stays for review; only the deployed copy is held back.
    expect(fs.existsSync(path.join(out, "okf", "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(out, "srv", "okf-bundle"))).toBe(false);
  });
});
