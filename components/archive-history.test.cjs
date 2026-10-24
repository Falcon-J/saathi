const assert = require('node:assert/strict')
const test = require('node:test')
const { existsSync, readFileSync } = require('node:fs')

test('archive history is reachable and reuses read-only task details without write actions', () => {
  const path = `${__dirname}/archive-history.tsx`
  const archive = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const dashboard = readFileSync(`${__dirname}/../app/dashboard/page.tsx`, 'utf8')
  assert.match(dashboard, /href="\/archive"/)
  assert.match(archive, /getArchivedWorkspaces/)
  assert.match(archive, /TaskEditorDialog/)
  assert.match(archive, /canEdit=\{false\}/)
  assert.match(archive, /canComment=\{false\}/)
  assert.match(archive, /ActivityHistory/)
  assert.doesNotMatch(archive, /\b(addTask|updateTask|toggleTask|deleteTask|addMember|removeMember)\b/)
})
