import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from './schema.ts'

test('agent execution binds a run and its lease to the same workspace task', () => {
  const runs = getTableConfig(schema.agentRuns)
  const leases = getTableConfig(schema.taskAgentLeases)
  const runTask = runs.foreignKeys.find(key => key.reference().foreignTable === schema.tasks)!.reference()
  assert.deepEqual(runTask.columns.map(column => column.name), ['workspace_id', 'task_id'])
  assert.deepEqual(runTask.foreignColumns.map(column => column.name), ['workspace_id', 'id'])
  assert.equal(runs.foreignKeys.find(key => key.reference().foreignTable === schema.tasks)!.onDelete, 'cascade')
  assert.ok(runs.uniqueConstraints.some(key => key.columns.map(column => column.name).join(',') === 'workspace_id,task_id,id'))
  assert.deepEqual(leases.primaryKeys[0].columns.map(column => column.name), ['workspace_id', 'task_id'])
  assert.equal(schema.agentRuns.fencingToken.dataType, 'bigint')
  assert.equal(schema.taskAgentLeases.fencingToken.dataType, 'bigint')
})

test('canvas grants and references preserve organization boundaries in composite relationships', () => {
  const grants = getTableConfig(schema.canvasResourceGrants)
  assert.ok(getTableConfig(schema.canvasResources).uniqueConstraints.some(key => key.columns.map(column => column.name).join(',') === 'organization_id,id'))
  for (const target of [schema.canvasResources, schema.canvasOrganizationMembers, schema.canvasGroups]) {
    const relationship = grants.foreignKeys.find(key => key.reference().foreignTable === target)!.reference()
    assert.equal(relationship.columns[0].name, 'organization_id')
    assert.equal(relationship.foreignColumns[0].name, 'organization_id')
  }
  const references = getTableConfig(schema.canvasReferences)
  const resourceKeys = references.foreignKeys.filter(key => key.reference().foreignTable === schema.canvasResources)
  assert.equal(resourceKeys.length, 2)
  assert.ok(resourceKeys.every(key => key.reference().columns[0].name === 'organization_id' && key.onDelete === 'cascade'))
  assert.equal(schema.canvasResourceGrants.capabilities.getSQLType(), 'text[]')
  assert.equal(schema.canvasAgentDelegations.capabilities.getSQLType(), 'text[]')
})

test('canvas actor bindings and historical deletion semantics are retained without cascading MCP receipts', () => {
  const events = getTableConfig(schema.canvasAccessEvents)
  assert.equal(events.foreignKeys.find(key => key.reference().foreignTable === schema.canvasResources)!.onDelete, 'set null')
  assert.ok(events.foreignKeys.some(key => key.reference().columns[0].name === 'actor_user_id' && key.reference().foreignTable === schema.profiles))
  assert.equal(getTableConfig(schema.platformCommandReceipts).foreignKeys.length, 0)
  assert.deepEqual(getTableConfig(schema.canvasAccessCommands).primaryKeys[0].columns.map(column => column.name), ['actor_user_id', 'command_id'])
  assert.ok(getTableConfig(schema.canvasOrganizationMembers).indexes.some(index => index.config.name === 'canvas_organization_members_actor_idx' && Boolean(index.config.where)))
})
