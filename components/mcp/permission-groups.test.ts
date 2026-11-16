import test from 'node:test'
import assert from 'node:assert/strict'
import { groupConnectionPermissions } from './permission-groups.ts'

test('permission groups preserve every exact scope, including unfamiliar ones', () => {
  const scopes = ['tasks:read', 'tasks:write', 'tasks:delete', 'canvas:grant', 'agent_runs:write', 'future:custom']
  const groups = groupConnectionPermissions(scopes)
  assert.deepEqual(groups.flatMap(group => group.scopes).sort(), [...scopes].sort())
  assert.deepEqual(groups.find(group => group.label === 'Access and administration')?.scopes, ['canvas:grant'])
  assert.deepEqual(groups.find(group => group.label === 'Destructive actions')?.scopes, ['tasks:delete'])
})
