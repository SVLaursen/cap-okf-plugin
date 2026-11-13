# 0009. Write cap-okf in TypeScript

- Status: Proposed
- Date: 2026-11-13
- Deciders: Simon Vestergaard Laursen
- Proposed by: Claude Code, at the maintainer's request

ADR-0008 stays reserved for the Fiori source-of-truth decision that `docs/PLAN.md` schedules
before Phase 5.

## Context

The project started in plain JavaScript. `CLAUDE.md` says "CommonJS modules, like other cap-js
plugins", and the plan's layout, the lint rules and the hooks all assume `.js` files under `lib/`.
The maintainer wants cap-okf written in TypeScript. That matches `@gavdi/cap-mcp` v2, the sibling
project it integrates with.

The switch is cheap now. Only one module exists (`parseConcept`, task 1.1), and it is still on an
unmerged branch. Every later phase adds code, so the cost grows with each task.

How cap-mcp-v2 does it (read at commit `590033c`):

- **Sources** are in `src/**/*.ts`. `tsc -p tsconfig.build.json` compiles them to CommonJS in
  `lib/`, with declaration files. `lib/` is gitignored and published (`files: ["lib/**/*",
  "cds-plugin.js", …]`).
- **`cds-plugin.js`** stays a one-line JavaScript entry that requires `lib/`. That's the file CAP
  looks for.
- **Compiler:** `tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, `module`/
  `moduleResolution: node16` and `types: [node, jest, @cap-js/cds-types]`, and covers `src/` and
  `test/`.
- **Tests** are TypeScript and run through `ts-jest`. Tests that boot CAP load the plugin from
  `src/`, not a possibly stale `lib/`:
  - `test/setup-env.js` points CAP's plugin list (`CDS_CONFIG.plugins`) at
    `test/cds-plugin-src.js`;
  - that file requires `src/index.ts`.
- **Child-process tests** (a real `cds build`) run against `lib/`, built once in Jest's
  `globalSetup`.
- **Lint:** `typescript-eslint` with type-aware rules (`no-floating-promises`,
  `no-explicit-any`, …).
- **`npm run check`** = `typecheck` + `lint` + `test`.

## Options considered

1. **Mirror cap-mcp-v2**: TypeScript in `src/`, compiled to CommonJS in `lib/`, tests in
   TypeScript through ts-jest.
   - Pro: one setup across both projects the maintainer runs.
   - Pro: types document the module contracts the plan relies on (`BundleSource`,
     `McpIntegration`, mapper registry, findings).
   - Pro: it's proven with CAP plugin loading, `cds.test` and `cds build`.
   - Con: a build step; `lib/` must be built before the demo or a packed package runs.
2. **TypeScript, compiled to ES modules.**
   - Con: most CAP plugins, cap-mcp-v2 included, are CommonJS.
   - Con: `cds-plugin.js` loading and `cds.test` are proven with CommonJS here.
3. **Stay with JavaScript, adding JSDoc types and `tsc --checkJs`.** No build step, but weaker
   checking, and not what the maintainer asked for.

## Decision (proposed)

Option 1, mirroring cap-mcp-v2:

- **Source:** `src/**/*.ts`, `strict` plus `noUncheckedIndexedAccess`, compiled with
  `tsc -p tsconfig.build.json` to CommonJS in `lib/`, with declarations.
  - `lib/` becomes build output: gitignored, published through `files`, and built by a `prepack`
    script so `npm pack`/`npm publish` can't ship a stale or missing `lib/`.
- **Plugin entry:** `cds-plugin.js` stays JavaScript and only requires `./lib/index.js`.
- **Tests:**
  - All tests are TypeScript (`test/**/*.test.ts`), run through `ts-jest`.
  - Tests that boot CAP load the plugin from `src/` through `test/setup-env.js` and
    `test/cds-plugin-src.js`.
  - Tests that need a real CLI child process use `lib/`, built once in `globalSetup`.
- **Lint:** `typescript-eslint` with the type-aware rules cap-mcp-v2 uses. The `lib/core` purity
  rule (no `@sap/cds`, no file system, no clock) moves to `src/core`.
- **`npm run check`** = `typecheck` + `lint` + `test`. CI adds `npm run build` before the
  `cds compile` preview step.
- **New dev dependencies** (governance: a PR note, no ADR needed for dev dependencies):
  `typescript`, `ts-jest`, `typescript-eslint`, `@types/node`, `@types/jest`,
  `@cap-js/cds-types`. No new runtime dependency; `yaml` stays the only one.
- **Paths in the plan, ADRs and `CLAUDE.md`:** a module named `lib/<path>.js` now means
  `src/<path>.ts`, compiled to `lib/<path>.js`. Accepted ADRs 0003–0007 aren't edited for this;
  this ADR is the mapping. The plan's target layout and `CLAUDE.md` are updated in the migration
  task.

## Consequences

- **A new migration task, before 1.1:**
  - set up the tooling;
  - convert the four existing test files to TypeScript;
  - update `package.json` (`main`, `files`, `types`, scripts), `.gitignore` (`lib/`),
    `eslint.config.mjs`, `ci.yml`, the plan's target layout, and the `CLAUDE.md` architecture
    rule and commands table.
- **Task 1.1** is then redone in TypeScript (`src/core/concept.ts`) from the finished JavaScript
  branch `feat/1.1-parse-concept`. Its tests and decisions carry over; the JS branch is deleted
  afterwards.
- **The demo** needs `npm run build` before `npm run demo` or `demo:build`, because it loads
  `cds-plugin.js` → `lib/`. The demo scripts run the build first.
- **For the maintainer:** `.claude/hooks/lint-file.mjs` only lints `.js`, `.cjs` and `.mjs` files.
  It needs `.ts` added to its pattern. Hooks are human-maintained.
- **For the maintainer:** `.claude/agents/reviewer.md` and `.claude/commands/gate-check.md` name
  `lib/core`. With this ADR that means `src/core`; worth updating when convenient.
- Types make the contracts in later ADRs explicit. When the code changes, its types must be kept
  in step.
