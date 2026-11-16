/**
 * Jest globalSetup for the integration tests: build lib/ once. Tests that start the cds CLI in a
 * child process run the plugin outside Jest's TypeScript transform, through cds-plugin.js → lib/.
 */
const { execFileSync } = require('node:child_process')
const { rmSync } = require('node:fs')
const path = require('node:path')

module.exports = function buildLib() {
  const root = path.join(__dirname, '..')
  // Same as `npm run build`: no stale files from an earlier build end up in lib/.
  rmSync(path.join(root, 'lib'), { recursive: true, force: true })
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })
}
