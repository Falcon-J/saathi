const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync, readdirSync } = require('node:fs')
const { join } = require('node:path')
const ts = require('typescript')

test('durable domain modules do not depend on application entry points', () => {
  const violations = []
  for (const name of readdirSync(join(__dirname, 'data'))) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    const source = ts.createSourceFile(name, readFileSync(join(__dirname, 'data', name), 'utf8'), ts.ScriptTarget.Latest)
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && /(?:^@\/app\/|\/app\/)/.test(statement.moduleSpecifier.text)) {
        violations.push(`${name}: ${statement.moduleSpecifier.text}`)
      }
    }
  }
  assert.deepEqual(violations, [], 'Put shared domain contracts below both actions and data modules')
})
