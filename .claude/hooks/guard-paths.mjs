// PreToolUse hook for Edit/Write: protects files that only humans may change directly.
// Exit code 2 blocks the edit and shows stderr to Claude.
import path from 'node:path'

const input = JSON.parse(await new Promise(resolve => {
  let data = ''
  process.stdin.on('data', chunk => { data += chunk })
  process.stdin.on('end', () => resolve(data || '{}'))
}))

const file = input?.tool_input?.file_path ?? ''
const root = process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd()
const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/')

const block = reason => {
  process.stderr.write(`Blocked by project governance: ${reason}\nSee docs/GOVERNANCE.md.\n`)
  process.exit(2)
}

// Governance and hook files change only through a human-reviewed PR.
if (rel === 'docs/GOVERNANCE.md' || rel.startsWith('.claude/hooks/') || rel === '.claude/settings.json') {
  block(`${rel} is maintained by humans. Propose the change in your PR description instead.`)
}

// Gate sign-off lines are written by the maintainer only.
if (rel.startsWith('docs/gates/') && /Signed off:/i.test(JSON.stringify(input?.tool_input ?? {}))) {
  block('only the maintainer adds "Signed off" to a gate report.')
}

// Accepted ADRs are immutable; supersede them with a new ADR.
if (/^docs\/adr\/0*[1-9]\d*-/.test(rel)) {
  try {
    const fs = await import('node:fs')
    const text = fs.readFileSync(path.join(root, rel), 'utf8')
    if (/Status:\s*Accepted/i.test(text)) block(`${rel} is Accepted and immutable; write a new ADR that supersedes it.`)
  } catch { /* new file: allowed */ }
}

process.exit(0)
