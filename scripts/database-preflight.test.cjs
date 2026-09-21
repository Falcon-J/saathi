const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

test('database preflight fails clearly when the test database is not configured', () => {
  const result = spawnSync(process.execPath, ['scripts/require-database-test.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_TEST_URL: '' },
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /DATABASE_TEST_URL is required for test:database/)
})
