import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/', 'coverage/', '**/gen/', 'bundle-preview/', 'test/fixtures/', 'test/golden/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      complexity: ['warn', 10],
      'max-lines-per-function': ['warn', { max: 50, skipComments: true, skipBlankLines: true }]
    }
  },
  {
    files: ['lib/core/**/*.js'],
    rules: {
      // lib/core must stay pure: no CAP, no file system, no clock.
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.name='require'][arguments.0.value=/^(@sap\\/cds|(node:)?fs(\\/promises)?)$/]", message: 'lib/core must not require @sap/cds or the file system.' },
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Inject the clock instead of calling Date.now() in lib/core.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Inject the clock instead of new Date() in lib/core.' }
      ]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  }
]
