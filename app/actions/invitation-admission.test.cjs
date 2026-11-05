const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const crypto = require('node:crypto')

function load(file, dependencies) {
  const exports = {}
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function('require', 'exports', 'console', js)(name => { assert.ok(name in dependencies, name); return dependencies[name] }, exports, { warn() {}, error() {} })
  return exports
}

function fixture({ outsider = false, member = false, existing = false, archived = false, missing = false, quotaFails = false, cacheFails = false } = {}) {
  const workspaceId = '11111111-1111-4111-8111-111111111111', owner = { id: 'owner', email: 'owner@example.test' }
  let session = outsider ? { id: 'outsider', email: 'outsider@example.test' } : owner
  let pending = existing, inserted = 0, charged = [], locked = false, committed = 0, events = 0
  const counts = new Map()
  const row = { id: 'invite', workspace_id: workspaceId, name: 'Workspace', username: 'Owner', inviter_email: owner.email, invitee_email: 'recipient@example.test', status: 'pending', created_at: new Date(), expires_at: new Date(Date.now() + 60000) }
  const db = { begin: async callback => {
    try {
      const result = await callback(async (strings, ...values) => {
        const sql = strings.join('?')
        if (sql.includes('SELECT workspace_id FROM workspace_invitations')) return [{ workspace_id: workspaceId }]
        if (sql.includes('SELECT * FROM workspace_invitations')) return [row]
        if (sql.includes('responded_at=now()')) { row.status = values[0]; return [] }
        if (sql.includes('SELECT * FROM workspaces')) { assert.match(sql, /FOR UPDATE/); locked = true; return missing ? [] : [{ id: workspaceId, owner_user_id: owner.id, archived_at: archived ? new Date() : null }] }
        if (sql.includes('SELECT m.user_id')) return member ? [{ user_id: 'recipient' }] : []
        if (sql.includes("SET status='expired'")) return []
        if (sql.includes('SELECT id FROM workspace_invitations')) return pending ? [{ id: 'invite' }] : []
        if (sql.includes('INSERT INTO workspace_invitations')) { inserted++; pending = true; row.id = values[0]; return [] }
        if (sql.includes('SELECT i.*,w.name')) return [row]
        throw new Error(`Unexpected SQL: ${sql}`)
      })
      committed++
      return result
    } finally { locked = false }
  } }
  const domain = load('lib/data/invitations.ts', { 'node:crypto': crypto, zod: require('zod'), '../db/client.ts': { getDb: () => db }, './events.ts': { appendDomainEvent: async () => { events++ }, flushOutbox: async () => {} } })
  class RateLimitExceeded extends Error {}
  const rate = { RateLimitExceeded, consumeDistributedRateLimit: async (scope, maximum) => {
    charged.push({ scope, locked })
    if (scope.startsWith('invite-recipient:') && quotaFails) throw new Error('Quota dependency unavailable')
    const count = (counts.get(scope) ?? 0) + 1; counts.set(scope, count)
    if (count > maximum) throw new RateLimitExceeded('Rate limit exceeded')
  } }
  const postcommit = load('lib/post-commit.ts', { 'next/server': { after() {} }, 'next/cache': { revalidatePath() { if (cacheFails) throw new Error('Cache unavailable') } }, './data/events': { flushOutbox: async () => {} } })
  const actions = load('app/actions/invitations.ts', {
    '@/lib/auth-simple': { getSession: async () => session }, 'next/cache': { revalidatePath() { if (cacheFails) throw new Error('Cache unavailable') } },
    '@/lib/post-commit': postcommit, '@/lib/data/invitations': domain, '@/lib/rate-limit': rate, 'node:crypto': crypto,
  })
  return { ...actions, workspaceId, counts, domain, charged: () => charged, writes: () => ({ inserted, committed, events }), asOwner() { session = owner }, owner }
}

test('five denied outsider attempts cannot exhaust the legitimate owner recipient quota', async () => {
  const f = fixture({ outsider: true })
  for (let i = 0; i < 5; i++) assert.match((await f.sendWorkspaceInvitation(f.workspaceId, 'recipient@example.test')).error, /owner/)
  assert.ok(f.charged().every(({ scope }) => scope.startsWith('invite-owner:')))
  f.asOwner()
  assert.equal((await f.sendWorkspaceInvitation(f.workspaceId, 'recipient@example.test')).success, true)
  assert.equal(f.writes().inserted, 1)
  assert.ok(f.charged().filter(({ scope }) => !scope.startsWith('invite-owner:')).every(({ locked }) => locked))
})

for (const [name, options, email, id] of [
  ['invalid email', {}, 'invalid'], ['self invite', {}, 'owner@example.test'], ['existing member', { member: true }, 'recipient@example.test'],
  ['archived workspace', { archived: true }, 'recipient@example.test'], ['missing workspace', { missing: true }, 'recipient@example.test'],
  ['invalid workspace', {}, 'recipient@example.test', 'invalid'],
]) test(`${name} does not consume shared invitation quota`, async () => {
  const f = fixture(options)
  const result = await f.sendWorkspaceInvitation(id ?? f.workspaceId, email)
  assert.ok(result.error)
  assert.deepEqual(f.charged().map(({ scope }) => scope.split(':')[0]), ['invite-owner'])
  assert.equal(f.writes().inserted, 0)
})

test('pending invitation replay bypasses shared quotas without creating another event', async () => {
  const f = fixture({ existing: true, quotaFails: true })
  const result = await f.sendWorkspaceInvitation(f.workspaceId, ' Recipient@Example.test ')
  assert.equal(result.success, true)
  assert.deepEqual(f.charged().map(({ scope }) => scope.split(':')[0]), ['invite-owner'])
  assert.equal(f.writes().inserted, 0)
  assert.equal(f.writes().events, 0)
})

test('quota dependency failure prevents a new invitation write', async () => {
  const f = fixture({ quotaFails: true })
  assert.ok((await f.sendWorkspaceInvitation(f.workspaceId, 'recipient@example.test')).error)
  assert.equal(f.writes().inserted, 0)
})

test('committed invitation remains successful when cache revalidation fails', async () => {
  const f = fixture({ cacheFails: true })
  assert.equal((await f.sendWorkspaceInvitation(f.workspaceId, 'recipient@example.test')).success, true)
  assert.equal(f.writes().inserted, 1)
})

test('committed invitation response remains successful when cache revalidation fails', async () => {
  const f = fixture({ cacheFails: true, existing: true })
  assert.equal((await f.revokeInvitation('invite')).success, true)
  assert.equal(f.writes().events, 1)
  assert.equal(f.writes().committed, 1)
})
