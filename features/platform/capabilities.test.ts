import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoverCapabilities, platformCapabilities } from './capabilities.ts'
import { platformContracts } from './contracts.ts'
test('discovery covers platform domains with unique typed tools', () => {
  const available = platformCapabilities.filter(c => c.available)
  assert.equal(new Set(platformCapabilities.map(c => c.name)).size, platformCapabilities.length)
  for (const name of ['workspaces.transfer_ownership', 'members.leave', 'invitation_links.preview', 'invitations.decline', 'tasks.assign', 'dependencies.add', 'comments.create', 'activity.list', 'archives.get', 'imports.csv', 'usage.get', 'capabilities.list']) {
    assert.ok(available.some(c => c.name === name), name)
    assert.ok(platformContracts[name as keyof typeof platformContracts], name)
  }
  assert.equal(available.some(c => /toggle|execute/.test(c.name)), false)
  assert.ok(available.some(c => c.name === 'canvas.resources'))
  assert.ok(available.some(c => c.name === 'canvas.policy_set'))
})
test('canvas mutation grants are distinct from resource reads and ordinary workspace editing', () => {
  assert.deepEqual(discoverCapabilities({ scopes: ['canvas:read'] }).map(item => item.name), ['canvas.resources'])
  const ordinary = discoverCapabilities({ scopes: ['workspaces:write', 'canvas:read'] }).map(item => item.name)
  for (const name of ['canvas.grant', 'canvas.revoke', 'canvas.policy_set', 'canvas.workspace_attach']) assert.equal(ordinary.includes(name), false)
  const policy = discoverCapabilities({ scopes: ['canvas:policy_set'] })
  assert.equal(policy.length, 1)
  assert.equal(policy[0].securitySensitive, true)
  assert.equal(policy[0].destructive, true)
})
test('verified agent coordination is discoverable but human approval is never an agent tool', () => {
  const reads = discoverCapabilities({ scopes: ['agent_runs:read'], readOnly: true }).map(item => item.name)
  assert.deepEqual(reads, ['agent_runs.list', 'agent_runs.get'])
  const writes = discoverCapabilities({ scopes: ['agent_runs:write'] }).map(item => item.name)
  assert.ok(writes.includes('agent_runs.claim'))
  assert.ok(writes.includes('agent_runs.submit_review'))
  assert.equal(writes.some(name => /human_review|approve|review$/.test(name) && name !== 'agent_runs.submit_review'), false)
  assert.equal(platformCapabilities.some(item => item.available && item.name === 'agent_runs.review'), false)
})
test('discovery scopes are explicit and read-only cannot discover mutations', () => {
  assert.deepEqual(discoverCapabilities({ scopes: [], readOnly: false }), [])
  const reads = discoverCapabilities({ scopes: ['tasks:read'], readOnly: true })
  assert.ok(reads.some(c => c.name === 'tasks.list'))
  assert.equal(reads.some(c => c.kind !== 'read'), false)
  assert.equal(reads.some(c => c.name === 'workspaces.get'), false)
  assert.equal(discoverCapabilities({ scopes: ['tasks:read'], readOnly: false }).some(c => c.name === 'tasks.delete'), false)
  assert.equal(discoverCapabilities({ scopes: ['tasks:write'], readOnly: true }).length, 0)
  const destructive = discoverCapabilities({ scopes: ['tasks:delete'], readOnly: false })
  assert.equal(destructive.find(c => c.name === 'tasks.delete')?.destructive, true)
})
test('ordinary edit grants do not include archive, ownership transfer or invitation revocation', () => {
  const names = discoverCapabilities({ scopes: ['workspaces:write', 'invitations:write', 'invitation_links:write'] }).map(capability => capability.name)
  assert.ok(names.includes('workspaces.update'))
  for (const forbidden of ['workspaces.archive', 'workspaces.transfer_ownership', 'invitations.revoke', 'invitation_links.revoke']) assert.equal(names.includes(forbidden), false, forbidden)
})
test('ordinary agent work cannot discover destructive coordination tools',()=>{
 const names=discoverCapabilities({scopes:['agent_runs:write']}).map(tool=>tool.name)
 assert.ok(names.includes('agent_runs.claim'));assert.ok(names.includes('agent_runs.report'))
 assert.equal(names.includes('agent_runs.cancel'),false);assert.equal(names.includes('agent_runs.release'),false)
 assert.deepEqual(discoverCapabilities({scopes:['agent_runs:cancel']}).map(tool=>tool.name),['agent_runs.cancel'])
 const cancel=platformCapabilities.find(tool=>tool.name==='agent_runs.cancel')!
 assert.equal(cancel.destructive,true);assert.equal(cancel.securitySensitive,true)
})
