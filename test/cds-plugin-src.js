/**
 * This repository's own tests load the plugin from the TypeScript sources (ts-jest transforms
 * them), so they never run against a stale lib/ and coverage counts src/. test/setup-env.js
 * points CAP's plugin list at this file; the published cds-plugin.js always loads lib/.
 */
require('../src/index.ts').plugin(require('@sap/cds'))
