const assert = require('node:assert/strict')
const test = require('node:test')
const { readFileSync } = require('node:fs')
const ts = require('typescript')

test('comment creation locks workspace before task, matching task and membership writes', async () => {
  const locks = []
  const tx = async strings => {
    const query = strings.join('?')
    if (/FOR UPDATE/.test(query)) locks.push(/FROM tasks/.test(query) ? 'tasks' : 'workspaces')
    if (/SELECT t.id/.test(query)) return [{ id: 'task', workspace_id: 'workspace', archived_at: null }]
    if (/SELECT .*FROM workspaces/.test(query)) return [{ archived_at: null }]
    if (/SELECT .*FROM tasks/.test(query)) return [{ id: 'task' }]
    if (/SELECT user_id/.test(query)) return [{ user_id: 'actor' }]
    if (/SELECT c.\*/.test(query)) return [{ id: 'comment', workspace_id: 'workspace', task_id: 'task', author_user_id: 'actor', author_email: 'member@example.test', body: 'Ready', created_at: '2026-10-04T10:00:00Z' }]
    return []
  }
  const dependencies = {
    '../db/client.ts': { getDb: () => ({ begin: callback => callback(tx) }) },
    './events.ts': { appendDomainEvent: async () => {}, flushOutbox: async () => {} },
    './tasks.ts': { TaskError: class extends Error {} },
  }
  const exports = {}
  const js = ts.transpileModule(readFileSync(`${__dirname}/comments.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  await exports.createTaskComment('actor', 'task', 'Ready')
  assert.deepEqual(locks, ['workspaces', 'tasks'])
})
