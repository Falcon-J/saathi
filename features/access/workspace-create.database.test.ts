import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../../lib/db/client.ts"
import { readWorkspace, removeWorkspaceMember, transferWorkspaceOwnershipRecord } from "../../lib/data/workspaces.ts"
import { withTransactionContext } from "../../lib/db/transaction-context.ts"
import { createCompany, createCanvasContainer, createWorkspaceInCanvas, addOrganizationMember, grantCanvasAccess, revokeCanvasGrant, getWorkspaceAccess } from "./service.ts"

test("contextual workspace creation commits placement and receipts atomically with current authority", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  const url = new URL(process.env.DATABASE_TEST_URL!)
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "requires disposable loopback database")
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb(), owner = randomUUID(), creator = randomUUID(), company = randomUUID(), space = randomUUID(), section = randomUUID(), grant = randomUUID()
  const workspaceIds: string[] = []
  const version = async (id: string) => Number((await db`SELECT version FROM canvas_resources WHERE id=${id}`)[0].version)
  const command = async (parentId = section) => {
    const workspaceId = randomUUID(); workspaceIds.push(workspaceId)
    return { commandId: randomUUID(), workspaceId, resourceId: randomUUID(), parentId, expectedParentVersion: await version(parentId), name: "Contextual delivery", summary: "Ship together", timezone: "UTC" }
  }
  await db`INSERT INTO auth.users(id,email) VALUES (${owner},${`${owner}@context.test`}),(${creator},${`${creator}@context.test`})`
  try {
    await createCompany(owner, { commandId: randomUUID(), id: company, name: "Context company" })
    await createCanvasContainer(owner, { commandId: randomUUID(), id: space, parentId: company, kind: "space", name: "Delivery", mode: "inherit" })
    await createCanvasContainer(owner, { commandId: randomUUID(), id: section, parentId: space, kind: "section", name: "Restricted launch", mode: "restricted" })
    await addOrganizationMember(owner, { commandId: randomUUID(), organizationId: company, userId: creator })
    await grantCanvasAccess(owner, { commandId: randomUUID(), id: grant, resourceId: section, expectedVersion: await version(section), principal: { kind: "user", id: creator }, capabilities: ["read", "create", "manage"] })

    await t.test("creates directly in sections and spaces and exact concurrent retries do not duplicate", async () => {
      const input = await command()
      const results = await Promise.all([createWorkspaceInCanvas(creator, input), createWorkspaceInCanvas(creator, input)])
      assert.deepEqual(results.map(result => result.replayed).sort(), [false, true])
      assert.deepEqual(results[0].affectedWorkspaceIds, [input.workspaceId])
      const workspace = await readWorkspace(input.workspaceId, creator)
      assert.equal(workspace?.name, input.name)
      assert.equal(workspace?.members.length, 1)
      assert.deepEqual((await getWorkspaceAccess(creator, input.workspaceId)).capabilities, ["read", "create", "manage"])
      const [placement] = await db`SELECT parent_id,policy_mode FROM canvas_resources WHERE workspace_id=${input.workspaceId}`
      assert.equal(placement.parent_id, section); assert.equal(placement.policy_mode, "inherit")
      const [events] = await db`SELECT count(*)::int AS count FROM activity_events WHERE workspace_id=${input.workspaceId}`
      const [outbox] = await db`SELECT count(*)::int AS count FROM outbox_events WHERE workspace_id=${input.workspaceId}`
      const [receipts] = await db`SELECT count(*)::int AS count FROM canvas_access_commands WHERE actor_user_id=${creator} AND command_id=${input.commandId}`
      assert.equal(events.count, 1); assert.equal(outbox.count, 1); assert.equal(receipts.count, 1)
      await assert.rejects(createWorkspaceInCanvas(creator, { ...input, name: "Changed retry" }), { code: "conflict" })
      const inSpace = await command(space)
      await createWorkspaceInCanvas(owner, inSpace)
      assert.ok(await readWorkspace(inSpace.workspaceId, owner))
    })

    await t.test("stale target versions and non-container targets leave no orphan", async () => {
      const stale = await command()
      await assert.rejects(createWorkspaceInCanvas(creator, { ...stale, expectedParentVersion: stale.expectedParentVersion + 1 }), { code: "conflict" })
      const root = await command(company)
      await assert.rejects(createWorkspaceInCanvas(owner, root), { code: "validation" })
      const rows = await db`SELECT id FROM workspaces WHERE id IN ${db([stale.workspaceId, root.workspaceId])}`
      assert.equal(rows.length, 0)
    })

    await t.test("creation and management must both be authorized on the selected target", async () => {
      const limited = randomUUID(), limitedGrant = randomUUID()
      await createCanvasContainer(owner, { commandId: randomUUID(), id: limited, parentId: space, kind: "section", name: "Limited authority", mode: "restricted" })
      await grantCanvasAccess(owner, { commandId: randomUUID(), id: limitedGrant, resourceId: limited, expectedVersion: await version(limited), principal: { kind: "user", id: creator }, capabilities: ["read", "create"] })
      const createOnly = await command(limited)
      await assert.rejects(createWorkspaceInCanvas(creator, createOnly), { code: "forbidden" })
      await revokeCanvasGrant(owner, { commandId: randomUUID(), resourceId: limited, grantId: limitedGrant, expectedVersion: await version(limited) })
      await grantCanvasAccess(owner, { commandId: randomUUID(), id: randomUUID(), resourceId: limited, expectedVersion: await version(limited), principal: { kind: "user", id: creator }, capabilities: ["read", "manage"] })
      const manageOnly = await command(limited)
      await assert.rejects(createWorkspaceInCanvas(creator, manageOnly), { code: "forbidden" })
      assert.equal((await db`SELECT id FROM workspaces WHERE id IN ${db([createOnly.workspaceId, manageOnly.workspaceId])}`).length, 0)
    })

    await t.test("attachment failure rolls back workspace, membership, activity, outbox and receipt; the same command can recover", async () => {
      const input = await command()
      await createCanvasContainer(owner, { commandId: randomUUID(), id: input.resourceId, parentId: space, kind: "section", name: "Temporary collision", mode: "inherit" })
      await assert.rejects(createWorkspaceInCanvas(creator, input), { code: "conflict" })
      const [counts] = await db`SELECT
        (SELECT count(*)::int FROM workspaces WHERE id=${input.workspaceId}) AS workspaces,
        (SELECT count(*)::int FROM workspace_members WHERE workspace_id=${input.workspaceId}) AS members,
        (SELECT count(*)::int FROM activity_events WHERE workspace_id=${input.workspaceId}) AS events,
        (SELECT count(*)::int FROM outbox_events WHERE workspace_id=${input.workspaceId}) AS outbox,
        (SELECT count(*)::int FROM canvas_access_commands WHERE actor_user_id=${creator} AND command_id=${input.commandId}) AS receipts`
      assert.deepEqual({ ...counts }, { workspaces: 0, members: 0, events: 0, outbox: 0, receipts: 0 })
      await db`DELETE FROM canvas_resources WHERE id=${input.resourceId}`
      assert.equal((await createWorkspaceInCanvas(creator, input)).replayed, false)
    })

    await t.test("replay requires current workspace membership and current target permission", async () => {
      const input = await command()
      await createWorkspaceInCanvas(creator, input)
      await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${input.workspaceId},${owner})`
      await transferWorkspaceOwnershipRecord(creator, input.workspaceId, owner, 1)
      await removeWorkspaceMember(owner, input.workspaceId, `${creator}@context.test`)
      await assert.rejects(createWorkspaceInCanvas(creator, input), { code: "forbidden" })
      await db.begin(async tx => withTransactionContext(tx, async () => {
        await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${input.workspaceId},${creator})`
        const workspace = await readWorkspace(input.workspaceId, owner, tx)
        assert.ok(workspace)
        await transferWorkspaceOwnershipRecord(owner, input.workspaceId, creator, workspace.version)
      }))
      assert.equal((await createWorkspaceInCanvas(creator, input)).replayed, true)
      const denied = await command()
      await revokeCanvasGrant(owner, { commandId: randomUUID(), resourceId: section, grantId: grant, expectedVersion: await version(section) })
      await assert.rejects(createWorkspaceInCanvas(creator, input), { code: "forbidden" })
      await assert.rejects(createWorkspaceInCanvas(creator, denied), { code: "forbidden" })
      assert.equal((await db`SELECT id FROM workspaces WHERE id=${denied.workspaceId}`).length, 0)
      assert.equal((await getWorkspaceAccess(creator, input.workspaceId)).allowed, false)
    })
  } finally {
    try {
      await db`DELETE FROM canvas_resources WHERE organization_id=${company}`
      await db`DELETE FROM canvas_organizations WHERE id=${company}`
      for (const id of workspaceIds) await db`DELETE FROM workspaces WHERE id=${id}`
      await db`DELETE FROM activity_events WHERE actor_user_id IN ${db([owner, creator])}`
      await db`DELETE FROM outbox_events WHERE workspace_id=ANY(${db.array(workspaceIds, 2950)})`
      await db`DELETE FROM profiles WHERE id IN ${db([owner, creator])}`
      await db`DELETE FROM auth.users WHERE id IN ${db([owner, creator])}`
    } finally { await db.end() }
  }
})
