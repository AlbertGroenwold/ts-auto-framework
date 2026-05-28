// Flat ESLint config. The @qa preset bundles naming rules, banned HTTP-client
// imports, a no-only guard, and the custom require-tc-annotation rule.
import qa from '@qa/eslint-config';

export default [
  ...qa,
  {
    // Project-specific tweaks go here, e.g.:
    // ignores: ['playwright-report/**', 'test-results/**'],
  },
];
