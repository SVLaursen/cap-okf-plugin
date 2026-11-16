// Load the plugin from src/ (test/cds-plugin-src.js) instead of lib/: CAP merges CDS_CONFIG over
// the plugins it found in an app's package.json. Child processes that must use lib/ drop
// CDS_CONFIG from their environment.
const path = require('node:path')

const config = JSON.parse(process.env.CDS_CONFIG || '{}')
config.plugins = {
  ...config.plugins,
  'cap-okf': { impl: path.join(__dirname, 'cds-plugin-src.js') }
}
process.env.CDS_CONFIG = JSON.stringify(config)
