import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { accessToolSchemas, createAccessPlatformHandlers } from "./platform.ts"
import type { AuthorizedCanvasResource } from "./service.ts"
import type { HandlerContext } from "../platform/executor.ts"

const actor = randomUUID(), workspaceId = randomUUID(), company = randomUUID(), section = randomUUID(), resourceId = randomUUID()
const context = (input: Record<string, unknown> = {}, workspaceIds: string[] | null = null): HandlerContext => ({ input,
  principal: { userId: actor, clientId: "acceptance-client", grantId: randomUUID(), capabilities: ["canvas:read", "canvas:write"], workspaceIds } })
const row = (id: string, parentId: string | null, kind: AuthorizedCanvasResource["kind"], workspace: string | null = null): AuthorizedCanvasResource =>
  ({ id, parentId, kind, workspaceId: workspace, organizationId: company, name: id, mode: parentId ? "inherit" : "restricted", version: 1, capabilities: ["read", "manage"] })

test("selected-workspace applications see only their authorized workspace and readable canonical ancestors", async () => {
  const other = randomUUID()
  const rows = [row(company, null, "organization"), row(section, company, "section"), row(resourceId, section, "workspace", workspaceId), row(other, company, "section")]
  const references = [{ id: randomUUID(), canvasResourceId: section, targetResourceId: resourceId }, { id: randomUUID(), canvasResourceId: section, targetResourceId: other }]
  const handlers = createAccessPlatformHandlers({ getAuthorizedCanvasView: async () => ({ resources: rows, references }) })
  const result = await handlers["canvas.resources"](context({}, [workspaceId]))
  assert.deepEqual((result.data as { resources: AuthorizedCanvasResource[] }).resources.map(row => row.id), [company, section, resourceId])
  assert.equal(JSON.stringify(result).includes(other), false)
  assert.deepEqual((result.data as { references: unknown[] }).references, [references[0]])
  assert.equal(accessToolSchemas["canvas.resources"].data.safeParse(result.data).success, true)
})

test("selected views never invent or reveal unreadable ancestor metadata", async () => {
  const handlers = createAccessPlatformHandlers({ getAuthorizedCanvasView: async () => ({ resources: [row(resourceId, section, "workspace", workspaceId)], references: [] }) })
  const result = await handlers["canvas.resources"](context({}, [workspaceId]))
  assert.equal((result.data as { resources: unknown[] }).resources.length, 1)
})

test("workspace-scoped applications cannot invoke global company management or its policy directory", async () => {
  let mutations = 0, details = 0
  const handlers = createAccessPlatformHandlers({
    createCompany: async () => { mutations++; return { id: company, version: 1, affectedWorkspaceIds: [], replayed: false } },
    getCanvasAccessDetails: async () => { details++; throw new Error("Should not read") },
  })
  await assert.rejects(handlers["canvas.company_create"](context({ id: company, name: "Company", commandId: randomUUID() }, [workspaceId])), /outside.*scope|global/i)
  await assert.rejects(handlers["canvas.access_details"](context({ resourceId }, [workspaceId])), /outside.*scope|global/i)
  assert.equal(mutations, 0); assert.equal(details, 0)
})

test("raw mutations bind the verified actor and preserve actual domain receipt results", async () => {
  let calledActor = ""
  const actual = { id: company, version: 2, affectedWorkspaceIds: [workspaceId], replayed: true }
  const handlers = createAccessPlatformHandlers({ createCompany: async actorId => { calledActor = actorId; return actual }, filterVisibleAccessMutationResult: async (_actor, result) => result })
  const result = await handlers["canvas.company_create"](context({ id: company, name: "Company", commandId: randomUUID() }))
  assert.equal(calledActor, actor)
  assert.deepEqual(result, { data: actual, version: 2 })
  assert.equal(accessToolSchemas["canvas.company_create"].data.safeParse(result.data).success, true)
})

test("strict shared mutation schemas reject actor spoofing and capability widening fields", async () => {
  let calls = 0
  const handlers = createAccessPlatformHandlers({ createCompany: async () => { calls++; throw new Error("Should not execute") } })
  await assert.rejects(handlers["canvas.company_create"](context({ id: company, name: "Company", commandId: randomUUID(), actorId: randomUUID() })))
  assert.equal(calls, 0)
})

test("fresh mutation envelopes omit delivery-only workspace identities filtered by current access", async () => {
  const hidden = randomUUID()
  const handlers = createAccessPlatformHandlers({
    createCompany: async () => ({ id: company, version: 1, affectedWorkspaceIds: [hidden], replayed: false }),
    filterVisibleAccessMutationResult: async (actorId, result) => { assert.equal(actorId, actor); return { ...result, affectedWorkspaceIds: [] } },
  })
  const result = await handlers["canvas.company_create"](context({ id: company, name: "Company", commandId: randomUUID() }))
  assert.equal(JSON.stringify(result).includes(hidden), false)
})

test("every declared access tool has an executable adapter and explicit raw data contract", () => {
  const handlers = createAccessPlatformHandlers()
  assert.equal(Object.keys(accessToolSchemas).length, 12)
  for (const [name, schema] of Object.entries(accessToolSchemas)) {
    assert.equal(typeof handlers[name], "function", name)
    assert.equal(typeof schema.input.safeParse, "function")
    assert.equal(typeof schema.data.safeParse, "function")
    assert.ok(["read", "mutate"].includes(schema.kind))
  }
  assert.equal(accessToolSchemas["canvas.workspace_attach"].destructive, true)
  assert.equal(accessToolSchemas["canvas.grant"].securitySensitive, true)
})
