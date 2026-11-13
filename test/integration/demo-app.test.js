const path = require('node:path')
const cds = require('@sap/cds')

// The demo app is where cap-okf runs as a real CAP plugin. CAP only loads plugins that an
// app lists as dependencies, never a project's own cds-plugin.js, so this proves the
// workspace wiring (`"cap-okf": "file:.."`) works.

const DEMO = path.join(__dirname, '..', '..', 'demo')
const PLUGIN_ENTRY = path.join(__dirname, '..', '..', 'cds-plugin.js')
const ALICE = { auth: { username: 'alice', password: 'alice' } }

const { GET } = cds.test(DEMO)

describe('demo app: cap-okf wiring', () => {
  test('loads cap-okf as a CAP plugin', () => {
    expect(cds.env.plugins['cap-okf']?.impl).toBe(PLUGIN_ENTRY)
  })

  // Tests run without NODE_ENV=production, so the [development] profile is active.
  test('serves the static route in development only, and no MCP (ADR-0002, ADR-0004)', () => {
    expect(cds.env.okf.serve).toEqual({ static: true, mcp: false })
  })
})

// These keep the demo bootable; they test the demo app, not cap-okf.
describe('demo app: smoke tests', () => {
  test('serves CatalogService to anonymous users', async () => {
    const { status } = await GET('/odata/v4/catalog/Books')
    expect(status).toBe(200)
  })

  test('rejects anonymous users on AdminService', async () => {
    await expect(GET('/odata/v4/admin/Books')).rejects.toMatchObject({ status: 401 })
  })

  test('lets alice (admin) read AdminService', async () => {
    const { status } = await GET('/odata/v4/admin/Books', ALICE)
    expect(status).toBe(200)
  })
})
