/**
 * Two test projects:
 *  - unit:        pure functions (later also conformance and golden suites). No CAP server.
 *  - integration: CAP apps booted with cds.test, and child processes running the cds CLI.
 *
 * Integration tests load the plugin from src/ (test/setup-env.js), so they never run against a
 * stale lib/. Child processes can't use ts-jest, so lib/ is built once first (test/build-lib.js).
 */
const tsJest = ['ts-jest', { tsconfig: 'tsconfig.json' }]

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: { '^.+\\.ts$': tsJest },
      testMatch: ['<rootDir>/test/unit/**/*.test.ts', '<rootDir>/test/conformance/**/*.test.ts', '<rootDir>/test/golden/**/*.test.ts']
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: { '^.+\\.ts$': tsJest },
      testMatch: ['<rootDir>/test/integration/**/*.test.ts', '<rootDir>/test/contract/**/*.test.ts'],
      setupFiles: ['<rootDir>/test/setup-env.js'],
      globalSetup: '<rootDir>/test/build-lib.js',
      // demo/gen/srv/package.json has the demo's name too; keep it out of Jest's module map.
      modulePathIgnorePatterns: ['<rootDir>/demo/gen/']
    }
  ],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts']
}
