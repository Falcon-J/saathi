import assert from "node:assert/strict"
import test from "node:test"
import { resolveWorkspaceSnapshot, projectAuthorizedCanvasView, filterWorkspaces, getWorkspaceAccess, createCompany, attachWorkspace } from "./service.ts"
import type { AccessSnapshot } from "./repository.ts"

const snapshot = (): AccessSnapshot => ({ asOf: "2026-11-12T12:00:00Z", records: [],
  workspaceMemberships: [{ workspaceId: "old", resourceId: null, member: true }, { workspaceId: "outside", resourceId: null, member: false },
    { workspaceId: "attached", resourceId: "resource", member: true }, { workspaceId: "not-member", resourceId: "resource", member: false }],
  graph: { resources: [{ id: "company", kind: "organization", parentId: null, mode: "restricted" },
    { id: "section", kind: "section", parentId: "company", mode: "inherit" }, { id: "resource", kind: "workspace", parentId: "section", mode: "inherit" }],
    grants: [{ id: "grant", resourceId: "section", principal: { kind: "user", id: "actor" }, capabilities: ["read"] }], memberships: [], references: [] } })

test("references require both independently authorized endpoints and never grant missing workspace membership", () => {
  const value = snapshot()
  value.records = value.graph.resources.map(resource => ({ ...resource, name: resource.id, organizationId: "company", version: 1, workspaceId: resource.id === "resource" ? "attached" : null }))
  value.graph.references = [{ id: "visible", canvasResourceId: "section", targetResourceId: "resource" }, { id: "hidden", canvasResourceId: "section", targetResourceId: "company" }]
  const actor = { kind: "user" as const, userId: "actor" }
  assert.deepEqual(projectAuthorizedCanvasView(actor, value).references.map(reference => reference.id), ["visible"])
  value.workspaceMemberships.find(row => row.workspaceId === "attached")!.member = false
  assert.deepEqual(projectAuthorizedCanvasView(actor, value).references, [])
  value.workspaceMemberships.find(row => row.workspaceId === "attached")!.member = true
  value.graph.grants[0].revokedAt = "2026-11-12T11:00:00Z"
  assert.deepEqual(projectAuthorizedCanvasView(actor, value), { resources: [], references: [] })
})

test("unattached members preserve their existing domain permission layer; nonmembers do not gain a fallback", () => {
  const result = resolveWorkspaceSnapshot("actor", snapshot())
  assert.equal(result.get("old")?.attached, false)
  assert.equal(result.get("old")?.allowed, true)
  assert.equal(result.get("old")?.capabilities.includes("edit"), true)
  assert.equal(result.get("outside")?.allowed, false)
})

test("section grants only narrow already authorized workspace membership", () => {
  const result = resolveWorkspaceSnapshot("actor", snapshot())
  assert.deepEqual(result.get("attached"), { attached: true, allowed: true, capabilities: ["read"] })
  assert.deepEqual(result.get("not-member"), { attached: true, allowed: false, capabilities: [] })
  assert.equal(resolveWorkspaceSnapshot("outsider", snapshot()).get("attached")?.allowed, false)
})

test("a restricted workspace without matching grant denies even an inherited section reader", () => {
  const value = snapshot(); value.graph.resources[2].mode = "restricted"
  assert.equal(resolveWorkspaceSnapshot("actor", value).get("attached")?.allowed, false)
})

test("malformed read/mutation inputs fail before opening a database connection", async () => {
  await assert.rejects(getWorkspaceAccess("not-an-actor", "not-a-workspace"), /Invalid canvas access identifier/)
  await assert.rejects(createCompany("bad", {} as never), /Invalid canvas access command/)
  await assert.rejects(attachWorkspace("bad", {} as never), /Invalid canvas access command/)
})

test("an empty authorized listing requires no database query", async () => {
  assert.deepEqual(await filterWorkspaces("00000000-0000-4000-8000-000000000001", []), [])
})
