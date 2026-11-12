import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const capabilities = ['read', 'create', 'edit', 'comment', 'manage', 'delete']

export function canvasAccessEnabled(value) {
  assert.ok(value === undefined || value === 'false' || value === 'true', 'SAATHI_QA_CANVAS_ACCESS must be true or false')
  return value === 'true'
}

export function planCanvasAccessFixtures(workspaceIds) {
  assert.ok(workspaceIds.length > 0 && workspaceIds.every(id => uuid.test(id)) && new Set(workspaceIds).size === workspaceIds.length, 'Expected unique fixture workspace UUIDs')
  return { organizationId: randomUUID(), groupId: randomUUID(), attachments: workspaceIds.map(workspaceId => ({ workspaceId, sectionId: randomUUID(), resourceId: randomUUID(), grantId: randomUUID() })) }
}

function validatePlan(plan) {
  assert.ok(plan.attachments.length > 0, 'Expected canvas fixture attachments')
  const ids = [plan.organizationId, plan.groupId, ...plan.attachments.flatMap(row => [row.workspaceId, row.sectionId, row.resourceId, row.grantId])]
  assert.ok(ids.every(id => uuid.test(id)) && new Set(ids).size === ids.length, 'Expected distinct owned fixture UUIDs')
}

/** Call within the existing fixture transaction, before server startup and measurement. */
export async function seedCanvasAccessFixtures(tx, plan, users) {
  validatePlan(plan)
  assert.ok(users.length > 0 && users.every(user => uuid.test(user.id)) && new Set(users.map(user => user.id)).size === users.length, 'Expected unique fixture actors')
  assert.ok(plan.attachments.every(row => users.some(user => user.workspace === row.workspaceId)) && users.every(user => plan.attachments.some(row => row.workspaceId === user.workspace)), 'Every attached workspace must have its fixture members')
  const ownerId = users[0].id
  await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,policy_mode,created_by_user_id)
    VALUES(${plan.organizationId},${plan.organizationId},NULL,'organization','Disposable NFR company','restricted',${ownerId})`
  await tx`INSERT INTO canvas_organizations(id,created_by_user_id) VALUES(${plan.organizationId},${ownerId})`
  await tx`INSERT INTO canvas_groups(id,organization_id,name,created_by_user_id) VALUES(${plan.groupId},${plan.organizationId},'Disposable NFR group',${ownerId})`
  for (const user of users) {
    await tx`INSERT INTO canvas_organization_members(organization_id,user_id) VALUES(${plan.organizationId},${user.id})`
    await tx`INSERT INTO canvas_group_members(organization_id,group_id,user_id) VALUES(${plan.organizationId},${plan.groupId},${user.id})`
  }
  for (const row of plan.attachments) {
    await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,policy_mode,created_by_user_id)
      VALUES(${row.sectionId},${plan.organizationId},${plan.organizationId},'section','Disposable NFR section','restricted',${ownerId})`
    await tx`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,workspace_id,policy_mode,created_by_user_id)
      VALUES(${row.resourceId},${plan.organizationId},${row.sectionId},'workspace',NULL,${row.workspaceId},'inherit',${ownerId})`
    await tx`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,group_id,capabilities,created_by_user_id)
      VALUES(${row.grantId},${plan.organizationId},${row.sectionId},${plan.groupId},${capabilities}::text[],${ownerId})`
  }
  return { organizations: 1, groups: 1, sections: plan.attachments.length, attachedWorkspaces: plan.attachments.length, organizationMembers: users.length, groupMembers: users.length, grants: plan.attachments.length }
}

/** Bottom-up deletes respect immutable canonical parents and the non-cascading parent FK.
 * Root deletion cascades only this run's company membership, group, grants and logs.
 * Call before deleting profiles, including after a failed/rolled-back fixture setup.
 */
export async function cleanupCanvasAccessFixtures(tx, plan) {
  validatePlan(plan)
  await tx`DELETE FROM canvas_resources WHERE id=ANY(${plan.attachments.map(row => row.resourceId)}::uuid[]) AND organization_id=${plan.organizationId}`
  await tx`DELETE FROM canvas_resources WHERE id=ANY(${plan.attachments.map(row => row.sectionId)}::uuid[]) AND organization_id=${plan.organizationId}`
  await tx`DELETE FROM canvas_resources WHERE id=${plan.organizationId} AND organization_id=${plan.organizationId}`
  const [remaining] = await tx`SELECT
    (SELECT count(*)::int FROM canvas_resources WHERE organization_id=${plan.organizationId}) AS resources,
    (SELECT count(*)::int FROM canvas_organizations WHERE id=${plan.organizationId}) AS organizations,
    (SELECT count(*)::int FROM canvas_groups WHERE organization_id=${plan.organizationId}) AS groups,
    (SELECT count(*)::int FROM canvas_organization_members WHERE organization_id=${plan.organizationId}) AS organization_members,
    (SELECT count(*)::int FROM canvas_group_members WHERE organization_id=${plan.organizationId}) AS group_members,
    (SELECT count(*)::int FROM canvas_resource_grants WHERE organization_id=${plan.organizationId}) AS grants,
    (SELECT count(*)::int FROM canvas_references WHERE organization_id=${plan.organizationId}) AS references,
    (SELECT count(*)::int FROM canvas_access_events WHERE organization_id=${plan.organizationId}) AS events,
    (SELECT count(*)::int FROM canvas_access_commands WHERE organization_id=${plan.organizationId}) AS commands`
  assert.ok(remaining && Object.values(remaining).every(count => count === 0), 'Owned canvas fixture cleanup left rows behind')
  return remaining
}
