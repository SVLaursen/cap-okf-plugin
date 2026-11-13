const path = require('node:path')
const fs = require('node:fs')
const cds = require('@sap/cds')

// The bookshop fixture is the input for every exporter and golden test in later phases.
// These tests pin down what it contains, so a careless edit to the fixture fails here first.

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bookshop')

function readProperties(file) {
  const entries = {}
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    entries[key.trim()] = rest.join('=').trim()
  }
  return entries
}

// Only the fixture's own .cds files count: keys inherited from @sap/cds/common
// (for example `CreatedAt` from `managed`) come with CAP's own text bundle.
function collectI18nKeys(folder) {
  const keys = new Set()
  const files = fs.readdirSync(folder, { recursive: true }).filter(file => file.endsWith('.cds'))
  for (const file of files) {
    const text = fs.readFileSync(path.join(folder, file), 'utf8')
    for (const match of text.matchAll(/\{i18n>([^}]+)\}/g)) keys.add(match[1])
  }
  return keys
}

describe('bookshop fixture', () => {
  let csn

  beforeAll(async () => {
    csn = await cds.load(FIXTURE)
  })

  test.each([
    ['sample.bookshop.Books', 'entity'],
    ['sample.bookshop.Authors', 'entity'],
    ['sample.bookshop.Genres', 'entity'],
    ['CatalogService', 'service'],
    ['CatalogService.Books', 'entity'],
    ['CatalogService.Authors', 'entity'],
    ['CatalogService.Genres', 'entity'],
    ['CatalogService.BookReserved', 'event'],
    ['AdminService', 'service'],
    ['AdminService.Books', 'entity'],
    ['AdminService.Authors', 'entity'],
    ['AdminService.Genres', 'entity']
  ])('defines %s as %s', (name, kind) => {
    expect(csn.definitions[name]?.kind).toBe(kind)
  })

  test('CatalogService.Books is a projection on the domain entity', () => {
    const books = csn.definitions['CatalogService.Books']
    expect(books.projection.from.ref).toEqual(['sample.bookshop.Books'])
  })

  test('CatalogService.Books has a bound action reserve', () => {
    const reserve = csn.definitions['CatalogService.Books'].actions?.reserve
    expect(reserve?.kind).toBe('action')
    expect(Object.keys(reserve.params)).toEqual(['copies'])
  })

  test('AdminService requires an authenticated user', () => {
    expect(csn.definitions.AdminService['@requires']).toBe('authenticated-user')
  })

  test('AdminService.Books carries an @restrict rule', () => {
    const restrict = csn.definitions['AdminService.Books']['@restrict']
    expect(Array.isArray(restrict)).toBe(true)
    expect(restrict.length).toBeGreaterThan(0)
  })

  test.each(['i18n.properties', 'i18n_de.properties'])('_i18n/%s has every key the model uses', bundle => {
    const texts = readProperties(path.join(FIXTURE, '_i18n', bundle))
    const usedKeys = collectI18nKeys(FIXTURE)
    expect(usedKeys.size).toBeGreaterThan(0)
    for (const key of usedKeys) expect(texts).toHaveProperty([key])
  })
})
