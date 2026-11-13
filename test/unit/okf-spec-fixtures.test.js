const path = require('node:path')
const fs = require('node:fs')

// The copied OKF spec is the source of truth for the parser, validator and spec-checker.
// These tests make sure the copy is complete and traceable to an upstream commit.

const SPEC_DIR = path.join(__dirname, '..', 'fixtures', 'okf-spec')
const BUNDLES_DIR = path.join(SPEC_DIR, 'bundles')

function read(file) {
  return fs.readFileSync(path.join(SPEC_DIR, file), 'utf8')
}

describe('OKF spec fixtures', () => {
  test('SPEC.md is version 0.2', () => {
    expect(read('SPEC.md')).toMatch(/\*\*Version 0\.2\*\*/)
  })

  test('LICENSE.md is the Apache License 2.0', () => {
    expect(read('LICENSE.md')).toMatch(/Apache License\s+Version 2\.0/)
  })

  test('SOURCE.md records the upstream repository and a full commit SHA', () => {
    const source = read('SOURCE.md')
    expect(source).toContain('https://github.com/GoogleCloudPlatform/knowledge-catalog')
    expect(source).toMatch(/\b[0-9a-f]{40}\b/)
  })

  test('every sample bundle has an index.md at its root', () => {
    const bundles = fs.readdirSync(BUNDLES_DIR)
    expect(bundles.length).toBeGreaterThan(0)
    for (const bundle of bundles) {
      expect(fs.existsSync(path.join(BUNDLES_DIR, bundle, 'index.md'))).toBe(true)
    }
  })
})
