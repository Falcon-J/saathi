const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

function fixture({ rows = [], publishFails = false, claimFails = false } = {}) {
  let transactions = 0, inTransaction = false
  const statements = [], published = [], warnings = []
  const db = async (strings, ...values) => {
    const sql = strings.join('?')
    statements.push({ sql, values })
    if (sql.includes('RETURNING id, payload')) {
      if (claimFails) throw new Error('private database details')
      return rows
    }
    return []
  }
  db.begin = async callback => {
    transactions++
    inTransaction = true
    try { return await callback(db) } finally { inTransaction = false }
  }
  const dependencies = {
    'node:crypto': require('node:crypto'),
    '../db/client.ts': { getDb: () => db },
    '../realtime.ts': { realtimeService: { publishEvent: async payload => {
      assert.equal(inTransaction, false, 'publication must happen after the claim commits')
      published.push(payload)
      if (publishFails) throw new Error('private provider details')
    } } },
  }
  const exports = {}
  const js = ts.transpileModule(readFileSync('lib/data/events.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', 'console', js)(name => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, exports, { warn: message => warnings.push(message) })
  return { flush: exports.flushOutbox, statements, published, warnings, transactions: () => transactions }
}

test('empty outbox claim uses one atomic statement without explicit transaction round trips', async () => {
  const ui = fixture()
  assert.deepEqual(await ui.flush('workspace'), { attempted: 0, published: 0, failed: 0, unavailable: false })
  assert.equal(ui.statements.length, 1)
  assert.equal(ui.transactions(), 0)
  const claim = ui.statements[0]
  assert.ok(claim.values.includes('workspace'))
  assert.match(claim.sql, /FOR UPDATE SKIP LOCKED/)
  assert.match(claim.sql, /LIMIT 25/)
  assert.match(claim.sql, /published_at IS NULL/)
})

test('successful publication acknowledges only its claimed row and matching token', async () => {
  const payload = { data: { eventId: 'event' } }
  const ui = fixture({ rows: [{ id: 'event', payload }] })
  assert.deepEqual(await ui.flush('workspace'), { attempted: 1, published: 1, failed: 0, unavailable: false })
  assert.deepEqual(ui.published, [payload])
  assert.equal(ui.statements.length, 2)
  const claimToken = ui.statements[0].values[0]
  assert.match(claimToken, /^[0-9a-f-]{36}$/)
  assert.deepEqual(ui.statements[1].values, ['event', claimToken])
  assert.match(ui.statements[1].sql, /published_at = now\(\)/)
})

test('publication failure releases its claim for retry without reporting a committed command failure', async () => {
  const ui = fixture({ rows: [{ id: 'event', payload: {} }], publishFails: true })
  assert.deepEqual(await ui.flush(), { attempted: 1, published: 0, failed: 1, unavailable: false })
  assert.equal(ui.statements.length, 2)
  assert.deepEqual(ui.statements[1].values, ['event', ui.statements[0].values[0]])
  assert.match(ui.statements[1].sql, /PUBLICATION_UNAVAILABLE/)
  assert.match(ui.statements[1].sql, /claimed_at = NULL, claim_token = NULL/)
})

test('claim database failure stays best effort and keeps diagnostics free of dependency details', async () => {
  const ui = fixture({ claimFails: true })
  assert.deepEqual(await ui.flush(), { attempted: 0, published: 0, failed: 0, unavailable: true })
  assert.deepEqual(ui.published, [])
  assert.equal(ui.warnings.length, 1)
  assert.doesNotMatch(ui.warnings.join(''), /private/)
})
