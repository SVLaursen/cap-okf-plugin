const path = require('node:path')
const cds = require('@sap/cds')

// The demo app is where cap-okf runs as a real CAP plugin. CAP only loads plugins that an
// app lists as dependencies (ADR-0005), so this proves the workspace wiring works.

const DEMO = path.join(__dirname, '..', '..', 'demo')
const PLUGIN_ENTRY = path.join(__dirname, '..', '..', 'cds-plugin.js')

const { GET } = cds.test(DEMO)

describe('demo app', () => {
  test('loads cap-okf as a CAP plugin', () => {
    expect(cds.env.plugins['cap-okf']?.impl).toBe(PLUGIN_ENTRY)
  })

  test('serves CatalogService to anonymous users', async () => {
    const { status } = await GET('/odata/v4/catalog/Books')
    expect(status).toBe(200)
  })

  test('rejects anonymous users on AdminService', async () => {
    await expect(GET('/odata/v4/admin/Books')).rejects.toMatchObject({ status: 401 })
  })

  test('lets alice (admin) read AdminService', async () => {
    const { status } = await GET('/odata/v4/admin/Books', { auth: { username: 'alice', password: 'alice' } })
    expect(status).toBe(200)
  })
})
