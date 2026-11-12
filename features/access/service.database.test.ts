import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { setTimeout as delay } from "node:timers/promises"
import { getDb } from "../../lib/db/client.ts"
import { withTransactionContext } from "../../lib/db/transaction-context.ts"
import { createAccessPlatformHandlers, accessToolSchemas, authorizeAccessPlatformReplay, getAccessPlatformPostCommitWorkspaces } from "./platform.ts"
import { createWorkspaceRecord, listWorkspaces, readWorkspace } from "../../lib/data/workspaces.ts"
import { createCompany, createCanvasContainer, attachWorkspace, addOrganizationMember, grantCanvasAccess,
  getWorkspaceAccess, filterWorkspaces, listAuthorizedCanvasResources, getAuthorizedCanvasView, createCanvasReference, revokeCanvasGrant,
  createCanvasGroup, setCanvasGroupMembership, assertWorkspaceAccess } from "./service.ts"

test("persisted company policy narrows membership, preserves receipts and closes cross-tenant/browser access", { skip: !process.env.DATABASE_TEST_URL }, async t => {
  const url = new URL(process.env.DATABASE_TEST_URL!)
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "access DB acceptance requires loopback fixtures")
  process.env.DATABASE_URL = process.env.DATABASE_TEST_URL
  const db = getDb()
  const [migration] = await db`SELECT to_regclass('public.canvas_resources') AS installed`
  assert.ok(migration.installed, "0013_canvas_access must be applied to the disposable local database first")
  const owner = randomUUID(), member = randomUUID(), outsider = randomUUID()
  const company = randomUUID(), otherCompany = randomUUID(), space = randomUUID(), section = randomUUID(), resourceId = randomUUID(), rootManagerGrant = randomUUID()
  const workspaces: string[] = []
  await db`INSERT INTO auth.users(id,email) VALUES (${owner},${`${owner}@example.test`}),(${member},${`${member}@example.test`}),(${outsider},${`${outsider}@example.test`})`
  try {
    const workspace = await createWorkspaceRecord(owner, { name: "Access acceptance workspace" }); workspaces.push(workspace.id)
    const legacy = await createWorkspaceRecord(owner, { name: "Unattached acceptance workspace" }); workspaces.push(legacy.id)
    const foreign = await createWorkspaceRecord(outsider, { name: "Foreign owner workspace" }); workspaces.push(foreign.id)
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
    const companyCommand = { id: company, name: "Acceptance company", commandId: randomUUID() }
    await createCompany(owner, companyCommand)
    assert.equal((await createCompany(owner, companyCommand)).replayed, true)
    await createCompany(owner, { id: otherCompany, name: "Separate company", commandId: randomUUID() })
    await createCanvasContainer(owner, { id: space, parentId: company, kind: "space", name: "Delivery", mode: "inherit", commandId: randomUUID() })
    await createCanvasContainer(owner, { id: section, parentId: space, kind: "section", name: "Launch", mode: "inherit", commandId: randomUUID() })
    await addOrganizationMember(owner, { organizationId: company, userId: member, commandId: randomUUID() })
    await addOrganizationMember(owner, { organizationId: company, userId: outsider, commandId: randomUUID() })

    await t.test("only the workspace owner and a managing parent can attach, and membership is not added", async () => {
      await assert.rejects(attachWorkspace(owner, { resourceId: randomUUID(), workspaceId: foreign.id, parentId: section, mode: "inherit", expectedWorkspaceVersion: 1, confirmMembershipRestriction: true, commandId: randomUUID() }), /workspace owner/i)
      await assert.rejects(attachWorkspace(member, { resourceId: randomUUID(), workspaceId: workspace.id, parentId: section, mode: "inherit", expectedWorkspaceVersion: 1, confirmMembershipRestriction: true, commandId: randomUUID() }), /access denied/i)
      const command = { resourceId, workspaceId: workspace.id, parentId: section, mode: "inherit" as const, expectedWorkspaceVersion: workspace.version, confirmMembershipRestriction: true as const, commandId: randomUUID() }
      await attachWorkspace(owner, command)
      assert.equal((await attachWorkspace(owner, command)).replayed, true)
      const [count] = await db`SELECT count(*)::int AS count FROM workspace_members WHERE workspace_id=${workspace.id}`
      assert.equal(count.count, 2)
      assert.equal((await getWorkspaceAccess(member, workspace.id)).allowed, false)
      assert.equal((await getWorkspaceAccess(owner, legacy.id)).attached, false)
    })

    let sectionVersion = 1
    const readGrant = randomUUID()
    const referenceId = randomUUID()
    await t.test("read grants do not grant edit or cross the required workspace membership layer", async () => {
      const result = await grantCanvasAccess(owner, { id: readGrant, resourceId: section, expectedVersion: sectionVersion, principal: { kind: "user", id: member }, capabilities: ["read"], commandId: randomUUID() })
      sectionVersion = result.version
      assert.deepEqual((await getWorkspaceAccess(member, workspace.id)).capabilities, ["read"])
      assert.deepEqual((await readWorkspace(workspace.id, member))?.capabilityCeiling, { read: true })
      assert.deepEqual((await listWorkspaces(member)).find(row => row.id === workspace.id)?.capabilityCeiling, { read: true })
      const outsiderGrant = await grantCanvasAccess(owner, { id: randomUUID(), resourceId: section, expectedVersion: sectionVersion, principal: { kind: "user", id: outsider }, capabilities: ["read", "edit"], commandId: randomUUID() })
      sectionVersion = outsiderGrant.version
      assert.equal((await getWorkspaceAccess(outsider, workspace.id)).allowed, false)
      assert.deepEqual(await filterWorkspaces(member, [workspace, legacy], "edit"), [])
      assert.equal((await listAuthorizedCanvasResources(outsider)).some(row => row.workspaceId === workspace.id), false)
      await createCanvasReference(owner, { id: referenceId, canvasResourceId: section, targetResourceId: resourceId, commandId: randomUUID() })
      assert.deepEqual((await getAuthorizedCanvasView(member)).references.map(reference => reference.id), [referenceId])
      const outsiderView = await getAuthorizedCanvasView(outsider)
      assert.deepEqual(outsiderView.references, [])
      assert.equal(JSON.stringify(outsiderView).includes(resourceId), false)
    })

    await t.test("revocation creates one durable event and replay does not duplicate it", async () => {
      const command = { grantId: readGrant, resourceId: section, expectedVersion: sectionVersion, commandId: randomUUID() }
      const result = await revokeCanvasGrant(owner, command); sectionVersion = result.version
      assert.equal((await revokeCanvasGrant(owner, command)).replayed, true)
      assert.equal((await getWorkspaceAccess(member, workspace.id)).allowed, false)
      const [events] = await db`SELECT count(*)::int AS count FROM canvas_access_events WHERE metadata->>'commandId'=${command.commandId}`
      assert.deepEqual((await getAuthorizedCanvasView(member)).references, [])
      assert.equal(events.count, 1)
      const [outbox] = await db`SELECT count(*)::int AS count FROM outbox_events WHERE workspace_id=${workspace.id} AND payload->'data'->>'accessChanged'='true'`
      assert.ok(outbox.count >= 3)
    })

    await t.test("an authorization read after waiting uses current statement time rather than transaction start", async () => {
      const id = randomUUID()
      const result = await grantCanvasAccess(owner, { id, resourceId: section, expectedVersion: sectionVersion,
        principal: { kind: "user", id: member }, capabilities: ["read", "edit"], commandId: randomUUID() })
      sectionVersion = result.version
      await db.begin(async tx => {
        await tx`UPDATE canvas_resource_grants SET expires_at=transaction_timestamp()+interval '1 second' WHERE id=${id}`
        const [started] = await tx`SELECT expires_at>transaction_timestamp() AS active FROM canvas_resource_grants WHERE id=${id}`
        assert.equal(started.active, true)
        await tx`SELECT pg_sleep(1.1)`
        assert.equal((await getWorkspaceAccess(member, workspace.id, tx)).allowed, false)
      })
    })

    await t.test("revocation waits for an admitted workspace writer, then fresh writes lose access", async () => {
      const id = randomUUID()
      const granted = await grantCanvasAccess(owner, { id, resourceId: section, expectedVersion: sectionVersion,
        principal: { kind: "user", id: member }, capabilities: ["read", "edit"], commandId: randomUUID() })
      sectionVersion = granted.version
      let unlock!: () => void, admitted!: () => void, revocationStarted!: () => void
      const writerAdmitted = new Promise<void>(resolve => { admitted = resolve })
      const releaseWriter = new Promise<void>(resolve => { unlock = resolve })
      const revokerEntered = new Promise<void>(resolve => { revocationStarted = resolve })
      let writerPid = 0, revokerPid = 0
      const writer = db.begin(async tx => {
        const [backend] = await tx`SELECT pg_backend_pid() AS pid`; writerPid = backend.pid
        await tx`SELECT id FROM workspaces WHERE id=${workspace.id} FOR UPDATE`
        admitted(); await releaseWriter
        await assertWorkspaceAccess(member, workspace.id, "edit", tx)
      })
      await writerAdmitted
      const originalBegin = db.begin
      type Begin = (callback: (tx: import("../../lib/db/client.ts").Transaction) => Promise<unknown>) => Promise<unknown>
      const begin = originalBegin as unknown as Begin
      db.begin = ((callback: Parameters<Begin>[0]) => begin.call(db, async tx => {
        const [backend] = await tx`SELECT pg_backend_pid() AS pid`; revokerPid = backend.pid
        revocationStarted()
        return callback(tx)
      })) as typeof db.begin
      const revoking = revokeCanvasGrant(owner, { grantId: id, resourceId: section, expectedVersion: sectionVersion, commandId: randomUUID() })
      // Observe actual lock blocking using a separate bounded connection, not a guessed sleep.
      const inspector = postgres(process.env.DATABASE_TEST_URL!, { max: 1, prepare: false, connect_timeout: 5 })
      try {
        await revokerEntered
        let blocked = false
        for (let attempt = 0; attempt < 100; attempt++) {
          const [state] = await inspector`SELECT ${writerPid}::int=ANY(pg_blocking_pids(${revokerPid}::int)) AS blocked`
          if (state.blocked) { blocked = true; break }
          await delay(10)
        }
        assert.equal(blocked, true, "policy revocation must serialize after the workspace's admitted writer")
      } finally {
        db.begin = originalBegin
        unlock()
        await inspector.end()
      }
      await writer
      sectionVersion = (await revoking).version
      await assert.rejects(assertWorkspaceAccess(member, workspace.id, "edit"), /access denied/i)
    })

    await t.test("a group manager cannot use group membership to bypass restricted children", async () => {
      const restricted = randomUUID(), groupId = randomUUID()
      await createCanvasContainer(owner, { id: restricted, parentId: space, kind: "section", name: "Restricted", mode: "restricted", commandId: randomUUID() })
      await createCanvasGroup(owner, { id: groupId, organizationId: company, name: "Restricted readers", commandId: randomUUID() })
      await grantCanvasAccess(owner, { id: randomUUID(), resourceId: restricted, expectedVersion: 1, principal: { kind: "group", id: groupId }, capabilities: ["read"], commandId: randomUUID() })
      await grantCanvasAccess(owner, { id: rootManagerGrant, resourceId: company, expectedVersion: 1, principal: { kind: "user", id: member }, capabilities: ["read", "manage"], commandId: randomUUID() })
      await assert.rejects(setCanvasGroupMembership(member, { organizationId: company, groupId, userId: member, active: true, expectedVersion: 1, commandId: randomUUID() }), /access denied/i)
      assert.equal((await listAuthorizedCanvasResources(member)).some(row => row.id === restricted), false)
    })

    await t.test("database rejects cross-company parents/grants and browser reads", async () => {
      await assert.rejects(db`INSERT INTO canvas_resources(id,organization_id,parent_id,kind,name,policy_mode,created_by_user_id)
        VALUES (${randomUUID()},${otherCompany},${section},'section','Invalid','inherit',${owner})`, /parent|foreign key/i)
      await assert.rejects(db`INSERT INTO canvas_resource_grants(id,organization_id,resource_id,user_id,capabilities,created_by_user_id)
        VALUES (${randomUUID()},${otherCompany},${section},${owner},ARRAY['read'],${owner})`, /foreign key/i)
      await assert.rejects(db.begin(async tx => { await tx`SET LOCAL ROLE authenticated`; await tx`SELECT * FROM canvas_resources` }), /permission denied/i)
    })

    await t.test("raw MCP handlers share outer receipt rollback and validate actual domain output", async () => {
      const handlers = createAccessPlatformHandlers()
      const principal = { userId: owner, clientId: `access-${randomUUID()}`, grantId: randomUUID(), capabilities: ["canvas:read", "canvas:write"], workspaceIds: null }
      const resources = await handlers["canvas.resources"]({ principal, input: {} })
      assert.equal(accessToolSchemas["canvas.resources"].data.safeParse(resources.data).success, true)
      const details = await handlers["canvas.access_details"]({ principal, input: { resourceId: section } })
      assert.equal(accessToolSchemas["canvas.access_details"].data.safeParse(details.data).success, true)
      const rollbackCompany = randomUUID(), commandId = randomUUID()
      await assert.rejects(db.begin(tx => withTransactionContext(tx, async () => {
        const result = await handlers["canvas.company_create"]({ principal, input: { id: rollbackCompany, name: "Must roll back", commandId } })
        assert.equal(accessToolSchemas["canvas.company_create"].data.safeParse(result.data).success, true)
        throw new Error("Outer receipt rejected output")
      })), /Outer receipt rejected output/)
      assert.equal((await db`SELECT id FROM canvas_resources WHERE id=${rollbackCompany}`).length, 0)
      assert.equal((await db`SELECT command_id FROM canvas_access_commands WHERE actor_user_id=${owner} AND command_id=${commandId}`).length, 0)
    })

    await t.test("public command IDs exclude hidden affected workspaces while internal delivery retains them", async () => {
      const shared = await grantCanvasAccess(owner, { id: randomUUID(), resourceId: section, expectedVersion: sectionVersion,
        principal: { kind: "user", id: outsider }, capabilities: ["read", "manage"], commandId: randomUUID() })
      sectionVersion = shared.version
      const [version] = await db`SELECT version FROM workspaces WHERE id=${foreign.id}`
      await attachWorkspace(outsider, { resourceId: randomUUID(), workspaceId: foreign.id, parentId: section, mode: "inherit",
        expectedWorkspaceVersion: version.version, confirmMembershipRestriction: true, commandId: randomUUID() })
      assert.equal((await getWorkspaceAccess(owner, foreign.id)).allowed, false)
      const handlers = createAccessPlatformHandlers()
      const principal = { userId: owner, clientId: `privacy-${randomUUID()}`, grantId: randomUUID(), capabilities: ["canvas:read", "canvas:write"], workspaceIds: null }
      const commandId = randomUUID()
      const result = await handlers["canvas.grant"]({ principal, input: { id: randomUUID(), resourceId: section, expectedVersion: sectionVersion,
        principal: { kind: "user", id: owner }, capabilities: ["read"], commandId } })
      sectionVersion = result.version!
      assert.equal(JSON.stringify(result.data).includes(foreign.id), false)
      assert.equal((await getAccessPlatformPostCommitWorkspaces(owner, commandId)).includes(foreign.id), true)
      const replay = await authorizeAccessPlatformReplay(principal, "canvas.grant", { id: (result.data as { id: string }).id, resourceId: section,
        expectedVersion: sectionVersion - 1, principal: { kind: "user", id: owner }, capabilities: ["read"], commandId }, result.data)
      assert.equal(JSON.stringify(replay).includes(foreign.id), false)
    })

    await t.test("historical outer platform receipts cannot bypass current resource management policy", async () => {
      const handlers = createAccessPlatformHandlers()
      const principal = { userId: member, clientId: `replay-${randomUUID()}`, grantId: randomUUID(), capabilities: ["canvas:read", "canvas:write"], workspaceIds: null }
      const input = { id: randomUUID(), organizationId: company, name: "Prior managed group", commandId: randomUUID() }
      const historical = await handlers["canvas.group_create"]({ principal, input })
      await revokeCanvasGrant(owner, { grantId: rootManagerGrant, resourceId: company, expectedVersion: 2, commandId: randomUUID() })
      await assert.rejects(authorizeAccessPlatformReplay(principal, "canvas.group_create", input, historical.data), /access denied/i)
    })
  } finally {
    await db`DELETE FROM workspaces WHERE id=ANY(${db.array(workspaces,2950)})`
    await db`DELETE FROM canvas_resources WHERE organization_id IN (${company},${otherCompany})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner},${member},${outsider})`
    await db`DELETE FROM outbox_events WHERE workspace_id=ANY(${db.array(workspaces,2950)})`
    await db`DELETE FROM profiles WHERE id IN (${owner},${member},${outsider})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${member},${outsider})`
    await db.end()
  }
})
