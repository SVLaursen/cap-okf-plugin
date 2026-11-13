// PreToolUse hook for Bash: blocks git actions that governance reserves for humans.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { execSync } from 'node:child_process'

const input = JSON.parse(await new Promise(resolve => {
  let data = ''
  process.stdin.on('data', chunk => { data += chunk })
  process.stdin.on('end', () => resolve(data || '{}'))
}))

const command = input?.tool_input?.command ?? ''
if (!/\bgit\b/.test(command)) process.exit(0)

const block = reason => {
  process.stderr.write(`Blocked by project governance: ${reason}\nSee docs/GOVERNANCE.md.\n`)
  process.exit(2)
}

if (/--no-verify\b/.test(command)) block('hooks may not be bypassed with --no-verify.')
if (/\bgit\s+push\b[^;&|]*\s(--force|-f|--force-with-lease)\b/.test(command)) block('force-push is not allowed.')
if (/\bgit\s+push\b[^;&|]*\b(main|HEAD:main)\b/.test(command)) block('pushing to main is not allowed; open a PR instead.')

if (/\bgit\s+(commit|push)\b/.test(command)) {
  let branch = ''
  try {
    branch = execSync('git symbolic-ref --short HEAD', {
      cwd: input?.cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim()
  } catch { /* not a repo yet: nothing to guard */ }
  if (branch === 'main') block('you are on main; create a branch first: git switch -c <type>/<task-id>-<slug>.')
}

process.exit(0)
