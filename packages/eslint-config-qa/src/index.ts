import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { qaPlugin } from './rules/index';

/**
 * Flat ESLint config for QA test repos — the static layer of the three-layer
 * standards enforcement. Consume from a repo's `eslint.config.js`:
 *
 *   import qa from '@qa/eslint-config';
 *   export default qa;
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { qa: qaPlugin },
    rules: {
      // Standards mirror: @tc: id required (also enforced at runtime).
      'qa/require-tc-annotation': 'error',

      // Naming conventions.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'import', format: null },
        { selector: 'objectLiteralProperty', format: null },
      ],

      // Banned imports: API tests use the Playwright `request` fixture, not ad-hoc HTTP clients.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'axios', message: 'Use the Playwright `request` fixture instead of axios.' },
            { name: 'node-fetch', message: 'Use the Playwright `request` fixture.' },
            { name: 'got', message: 'Use the Playwright `request` fixture.' },
          ],
        },
      ],

      // No focused tests left in the suite — they silently drop coverage in CI.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='test'][callee.property.name='only']",
          message: 'Remove test.only before committing — it silently skips the rest of the suite.',
        },
        {
          selector:
            "CallExpression[callee.object.property.name='describe'][callee.property.name='only']",
          message: 'Remove describe.only before committing.',
        },
      ],
    },
  },
);
