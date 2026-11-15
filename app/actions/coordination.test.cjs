const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const owner = 'a0ee1450-5025-4f48-8b37-32cf71af3c44', workspaceId = 'b0ee1450-5025-4f48-8b37-32cf71af3c44', runId = 'c0ee1450-5025-4f48-8b37-32cf71af3c44', commandId = 'd0ee1450-5025-4f48-8b37-32cf71af3c44'
function fixture({ session = { id: owner }, authorization = null, error, postCommitFails = false, replayed = false } = {}) {
  const calls = []
  const headers = new Headers({ origin: 'https://app.example' }); if (authorization) headers.set('authorization', authorization)
  const deps = {
    'next/headers': { headers: async () => headers },
    '@/lib/auth-simple': { getSession: async () => session },
    '@/lib/post-commit': { afterDomainCommit: id => { calls.push(['commit', id]); if (postCommitFails) throw new Error('private schedule details') } },
    '@/features/coordination/contracts': require('../../features/coordination/contracts.ts'),
    '@/features/coordination/handlers': {
      reviewCoordinationRun: async value => { calls.push(['review', value]); if (error) throw error; return { result: { id: runId, workspaceId, state: 'succeeded' }, replayed } },
      listCoordinationRunsForHuman: async value => { calls.push(['list', value]); return { items: [], nextCursor: null } },
    },
  }
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync('app/actions/coordination.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'exports', 'process', js)(name => { assert.ok(name in deps, name); return deps[name] }, exports, { env: { NEXT_PUBLIC_APP_URL: 'https://app.example' } })
  return { ...exports, calls }
}
const input = { commandId, workspaceId, runId, decision: 'approve', expectedTaskVersion: 4 }
test('human review derives reviewer from live session, preserves expected task version, and schedules only committed changes', async () => {
  const action = fixture()
  assert.equal((await action.reviewAgentRun(input)).success, true)
  assert.deepEqual(action.calls, [['review', { reviewerUserId: owner, input }], ['commit', workspaceId]])
  const spoofed = fixture()
  assert.ok((await spoofed.reviewAgentRun({ ...input, reviewerUserId: runId })).error)
  assert.deepEqual(spoofed.calls, [])
  const missing = fixture({ session: null })
  assert.ok((await missing.reviewAgentRun(input)).error)
  assert.deepEqual(missing.calls, [])
})
test('bearer requests cannot invoke human review and conflicts remain actionable without internal diagnostics', async () => {
  const bearer = fixture({ authorization: 'Bearer hidden-token' })
  assert.ok((await bearer.reviewAgentRun(input)).error)
  assert.deepEqual(bearer.calls, [])
  const conflict = fixture({ error: Object.assign(new Error('private database details'), { code: 'version_conflict' }) })
  const result = await conflict.reviewAgentRun(input)
  assert.equal(result.code, 'version_conflict')
  assert.match(result.error, /Refresh/)
  assert.ok(!result.error.includes('private'))
  assert.ok(!conflict.calls.some(call => call[0] === 'commit'))
})
test('run listing uses human service without manufacturing an OAuth principal; postcommit failure cannot undo review result', async () => {
  const action = fixture({ postCommitFails: true })
  assert.deepEqual(await action.getAgentActivity(workspaceId), { runs: [], nextCursor: null })
  assert.deepEqual(action.calls[0], ['list', { userId: owner, input: { workspaceId, limit: 50 } }])
  assert.equal((await action.reviewAgentRun(input)).success, true)
})
test('successful receipt replay also schedules outbox recovery after a lost initial response', async () => {
  const action = fixture({ replayed: true })
  assert.equal((await action.reviewAgentRun(input)).success, true)
  assert.ok(action.calls.some(call => call[0] === 'commit'))
})
