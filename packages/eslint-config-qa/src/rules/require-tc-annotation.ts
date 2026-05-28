import type { Rule } from 'eslint';
import type { CallExpression, ObjectExpression } from 'estree';

/** Does this call declare a test case that must carry a @tc: id? */
function isTestCase(node: CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name === 'test';
  // test.only(...) — same requirement. (skip/fixme have ambiguous signatures.)
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'test' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'only'
  );
}

function isTcLiteral(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('@tc:');
}

/** Does the test-options object carry a `tag` with at least one @tc: entry? */
function hasTcTag(obj: ObjectExpression): boolean {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    const key = prop.key;
    const name =
      key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : '';
    if (name !== 'tag') continue;

    const value = prop.value;
    if (value.type === 'Literal') return isTcLiteral(value.value);
    if (value.type === 'ArrayExpression') {
      return value.elements.some(
        (el) => el != null && el.type === 'Literal' && isTcLiteral(el.value),
      );
    }
  }
  return false;
}

/** Static mirror of the runtime guard: every test must carry a @tc: id. */
export const requireTcAnnotation: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a @tc: annotation on every test case.' },
    schema: [],
    messages: {
      missing:
        "Test is missing a required @tc: annotation, e.g. test('...', { tag: ['@tc:LOGIN-001'] }, ...).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isTestCase(node)) return;
        const options = node.arguments.find((a) => a.type === 'ObjectExpression');
        if (options?.type === 'ObjectExpression' && hasTcTag(options)) return;
        context.report({ node, messageId: 'missing' });
      },
    };
  },
};
