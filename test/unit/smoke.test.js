const path = require('node:path')

// The plugin entry is what CAP loads first; if requiring it throws, every app using cap-okf fails to start.
describe('cds-plugin.js', () => {
  test('can be required without throwing', () => {
    const entry = path.join(__dirname, '..', '..', 'cds-plugin.js')
    expect(() => require(entry)).not.toThrow()
  })
})
