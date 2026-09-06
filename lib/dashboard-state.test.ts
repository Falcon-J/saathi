import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDashboardState } from './dashboard-state.ts'

test('workspace creation is never shown until the authenticated query succeeds empty', () => {
  const base = { authenticated: true, loading: false, error: null, workspaceCount: 0, creating: false }
  assert.equal(getDashboardState({ ...base, authenticated: false }), 'auth-loading')
  assert.equal(getDashboardState({ ...base, loading: true }), 'workspace-loading')
  assert.equal(getDashboardState({ ...base, error: 'Unavailable' }), 'workspace-error')
  assert.equal(getDashboardState(base), 'empty')
  assert.equal(getDashboardState({ ...base, workspaceCount: 2 }), 'workspace')
  assert.equal(getDashboardState({ ...base, workspaceCount: 2, creating: true }), 'creating')
  assert.equal(getDashboardState({ ...base, workspaceCount: 2, creating: true, error: 'Unavailable' }), 'workspace-error')
})
