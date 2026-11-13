// PostToolUse hook for Edit/Write: lints the changed JavaScript file and reports problems back to Claude.
// Exit code 2 feeds stderr to Claude so it fixes the issue before moving on.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const input = JSON.parse(await new Promise(resolve => {
  let data = ''
  process.stdin.on('data', chunk => { data += chunk })
  process.stdin.on('end', () => resolve(data || '{}'))
}))

const file = input?.tool_input?.file_path ?? ''
if (!/\.(c|m)?js$/.test(file)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()
const eslint = path.join(root, 'node_modules', '.bin', 'eslint')
if (!existsSync(eslint)) process.exit(0) // tooling not installed yet (Phase 0.1)

const result = spawnSync(eslint, ['--fix', file], { cwd: root, encoding: 'utf8' })
if (result.status !== 0) {
  process.stderr.write(`ESLint found problems in ${file}:\n${result.stdout}${result.stderr}`)
  process.exit(2)
}
process.exit(0)
