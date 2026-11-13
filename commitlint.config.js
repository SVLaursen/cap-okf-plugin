module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['core', 'export', 'bundle', 'build', 'serve', 'add', 'java', 'docs', 'ci', 'deps']]
  }
}
