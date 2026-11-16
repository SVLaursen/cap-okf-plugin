// cap-okf plugin entry. CAP loads this file for every app that has cap-okf as a dependency.
// The code is TypeScript in src/, compiled to lib/ (ADR-0009); this file only hands CAP's
// `cds` facade to it.
require('./lib/index.js').plugin(require('@sap/cds'))
