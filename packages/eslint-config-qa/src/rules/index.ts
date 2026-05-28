import type { ESLint } from 'eslint';
import { requireTcAnnotation } from './require-tc-annotation';

/** The `qa` ESLint plugin: bundles the framework's custom rules. */
export const qaPlugin: ESLint.Plugin = {
  meta: { name: '@qa/eslint-config', version: '0.0.0' },
  rules: {
    'require-tc-annotation': requireTcAnnotation,
  },
};
