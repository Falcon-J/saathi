import assert from "node:assert/strict"
import test from "node:test"
import { layoutCompanyResources, projectCanvasReferences } from "./company-layout.ts"
import type { AuthorizedCanvasResource } from "../../features/access/service.ts"

const resource = (id: string, parentId: string | null, kind: AuthorizedCanvasResource["kind"] = "section", workspaceId: string | null = null): AuthorizedCanvasResource =>
  ({ id, parentId, kind, workspaceId, name: id, organizationId: "org", mode: "inherit", version: 1, capabilities: ["read"] })

test("canvas associations use canonical endpoint IDs, stable ordering and distinct accessible appearance", () => {
  const records = [resource("section", null), resource("attached", "section", "workspace", "w")]
  const references = [{ id: "link", canvasResourceId: "section", targetResourceId: "attached" }, { id: "hidden", canvasResourceId: "section", targetResourceId: "private" }]
  const edges = projectCanvasReferences(records, references)
  assert.deepEqual(edges, projectCanvasReferences([...records].reverse(), [...references].reverse()))
  assert.equal(edges.length, 1)
  assert.equal(edges[0].id, "association:link")
  assert.equal(edges[0].source, "container:section")
  assert.equal(edges[0].target, "workspace:w")
  assert.match(edges[0].ariaLabel, /section to attached/)
  assert.equal(edges[0].animated, false)
  assert.ok(edges[0].style.strokeDasharray)
  assert.equal(projectCanvasReferences([records[0], { ...records[1], organizationId: "other" }], references).length, 0)
})

test("canonical company layout keeps stable workspace identity and parent-relative task room", () => {
  const resources = [resource("org", null, "organization"), resource("section", "org"), resource("attached", "section", "workspace", "w")]
  const selected = { workspaceId: "w", nodeId: "workspace:w", width: 760, height: 1300 }
  const result = layoutCompanyResources(resources, selected)
  const workspace = result.find(row => row.workspaceId === "w")!
  const section = result.find(row => row.resourceId === "section")!
  assert.equal(workspace.id, selected.nodeId)
  assert.equal(workspace.parentId, section.id)
  assert.equal(workspace.height, 1300)
  assert.ok(section.height > workspace.height)
  assert.deepEqual(result, layoutCompanyResources([...resources].reverse(), selected))
})

test("a visible child of an unreadable parent becomes a visible root without inventing hidden parents", () => {
  const result = layoutCompanyResources([resource("readable", "private")])
  assert.equal(result.length, 1)
  assert.equal(result[0].parentId, undefined)
  assert.equal(result.some(row => row.resourceId === "private"), false)
})

test("a personal unattached workspace keeps its canonical node ID and stays outside company containment", () => {
  const result = layoutCompanyResources([resource("org", null, "organization")], { workspaceId: "personal", nodeId: "workspace:personal", width: 320, height: 160 })
  const personal = result.find(row => row.workspaceId === "personal")!
  assert.equal(personal.parentId, undefined)
  assert.equal(personal.id, "workspace:personal")
  assert.notDeepEqual(personal.position, result.find(row => row.resourceId === "org")!.position)
})

test("all authorized legacy workspaces appear once without inventing task readiness", () => {
  const result = layoutCompanyResources([resource("attached", "section", "workspace", "w")],
    { workspaceId: "selected", nodeId: "workspace:selected", width: 760, height: 1000 }, [{ id: "w" }, { id: "selected" }, { id: "legacy" }])
  assert.deepEqual(result.filter(row => row.kind === "workspace").map(row => row.workspaceId).sort(), ["legacy", "selected", "w"])
  assert.equal(result.find(row => row.workspaceId === "legacy")?.id, "workspace:legacy")
  assert.equal("readiness" in result.find(row => row.workspaceId === "legacy")!, false)
})

test("cyclic and duplicate layout inputs fail instead of hanging the renderer", () => {
  assert.throws(() => layoutCompanyResources([resource("a", "b"), resource("b", "a")]), /cycle/i)
  assert.throws(() => layoutCompanyResources([resource("a", null), resource("a", null)]), /duplicate/i)
})
