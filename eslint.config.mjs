import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Modules src/core must never touch: CAP and the file system (CLAUDE.md, ADR-0009).
const FORBIDDEN_IN_CORE = '/^(@sap\\/cds|(node:)?fs(\\/promises)?)$/'

// Rules that keep code small and readable, for TypeScript and JavaScript alike.
const styleRules = {
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  complexity: ['warn', 10],
  'max-lines-per-function': ['warn', { max: 50, skipComments: true, skipBlankLines: true }]
}

export default tseslint.config(
  { ignores: ['node_modules/', 'coverage/', 'lib/', '**/gen/', 'bundle-preview/', 'test/fixtures/', 'test/golden/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    // Type-aware rules need the TypeScript program (tsconfig.json covers src/ and test/).
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      ...styleRules,
      // A promise nobody awaits loses its error; one passed where a callback is expected too.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // Keep casts visible and rare.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // src/core must stay pure: no CAP, no file system, no clock (CLAUDE.md, ADR-0009).
      'no-restricted-syntax': ['error',
        // Every way TypeScript can pull in a module: import, import(), export … from, import x = require().
        ...['ImportDeclaration', 'ImportExpression', 'ExportAllDeclaration', 'ExportNamedDeclaration'].map(node => ({
          selector: `${node}[source.value=${FORBIDDEN_IN_CORE}]`,
          message: 'src/core must not use @sap/cds or the file system.'
        })),
        { selector: 'TSImportEqualsDeclaration', message: 'src/core uses import, not import = require().' },
        // The clock, read directly or through globalThis.
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'Inject the clock instead of Date.now in src/core.' },
        { selector: "MemberExpression[object.object.name='globalThis'][object.property.name='Date']", message: 'Inject the clock instead of globalThis.Date in src/core.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Inject the clock instead of new Date() in src/core.' }
      ]
    }
  },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      ...styleRules,
      // Plain CommonJS files (cds-plugin.js, configs, test wiring) use require.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  },
  {
    files: ['test/**/*.js', 'test/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } }
  }
)
