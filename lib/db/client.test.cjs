const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

test('development reloads reuse one lazy database client', () => {
  const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const shared = {}, env = { NODE_ENV: 'development', DATABASE_URL: 'test-only-placeholder' }
  let factories = 0
  const load = () => {
    const exports = {}
    new Function('require', 'exports', 'process', 'globalThis', js)(() => ({ default: () => { factories++; return { id: factories } } }), exports, { env }, shared)
    return exports
  }
  const first = load(), reloaded = load()
  assert.equal(factories, 0, 'importing must not open a connection')
  assert.equal(first.getDb(), reloaded.getDb())
  assert.equal(factories, 1)
})

test('missing database configuration fails before a client is created', () => {
  const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  let factories = 0
  new Function('require', 'exports', 'process', 'globalThis', js)(() => ({ default: () => { factories++; return {} } }), exports, { env: {} }, {})
  assert.throws(() => exports.getDb(), /Database is not configured/)
  assert.equal(factories, 0)
})
