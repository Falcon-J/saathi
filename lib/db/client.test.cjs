const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')
const transactionContext = require('./transaction-context.ts')
const dependencies = postgresFactory => name => {
  if (name === 'postgres') return { default: postgresFactory }
  if (name === './transaction-context.ts') return transactionContext
  throw new Error(`Unexpected dependency: ${name}`)
}

test('development reloads reuse one lazy database client', () => {
  const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const shared = {}, env = { NODE_ENV: 'development', DATABASE_URL: 'test-only-placeholder' }
  let factories = 0
  const load = () => {
    const exports = {}
    new Function('require', 'exports', 'process', 'globalThis', js)(dependencies(() => { factories++; return { id: factories } }), exports, { env }, shared)
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
  new Function('require', 'exports', 'process', 'globalThis', js)(dependencies(() => { factories++; return {} }), exports, { env: {} }, {})
  assert.throws(() => exports.getDb(), /Database is not configured/)
  assert.equal(factories, 0)
})

for (const [configured, expected] of [[undefined, 1], ['5', 5], ['10', 10]]) {
  test(`database pool forwards ${configured ?? 'default'} capacity without changing connection safeguards`, () => {
    const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}, calls = [], env = { NODE_ENV: 'production', DATABASE_URL: 'test-only-placeholder' }
    if (configured !== undefined) env.DATABASE_POOL_MAX = configured
    new Function('require', 'exports', 'process', 'globalThis', js)(dependencies((...args) => { calls.push(args); return {} }), exports, { env }, {})
    assert.equal(calls.length, 0)
    assert.equal(exports.getDb(), exports.getDb())
    assert.deepEqual(calls, [['test-only-placeholder', { prepare: false, max: expected, connect_timeout: 10 }]])
  })
}

for (const configured of ['', ' ', '0', '11', '1.5', '-1', 'NaN', 'Infinity', '1e0', '01', '5secret']) {
  test(`invalid database pool capacity ${JSON.stringify(configured)} fails without leaking configuration`, () => {
    const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
    const exports = {}; let factories = 0
    new Function('require', 'exports', 'process', 'globalThis', js)(dependencies(() => { factories++; return {} }), exports, { env: { DATABASE_URL: 'test-only-private-url', DATABASE_POOL_MAX: configured } }, {})
    assert.throws(() => exports.getDb(), { message: 'DATABASE_POOL_MAX must be an integer from 1 to 10' })
    assert.equal(factories, 0)
  })
}


test('getDb uses a transaction context before consulting pool configuration', async () => {
  const js = ts.transpileModule(readFileSync(`${__dirname}/client.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('require', 'exports', 'process', 'globalThis', js)(dependencies(() => { throw new Error('pool opened') }), exports, { env: {} }, {})
  const transaction = Object.assign(() => {}, { savepoint: async callback => callback(transaction) })
  await transactionContext.withTransactionContext(transaction, async () => {
    assert.equal(exports.getDb(), transactionContext.getTransactionDatabase())
  })
  assert.throws(() => exports.getDb(), /Database is not configured/)
})
