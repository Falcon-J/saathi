import { workspaceNodeId } from "../../features/canvas/model.ts"
import { MAX_RESOURCE_DEPTH } from "../../features/access/contracts.ts"
import type { AuthorizedCanvasResource } from "../../features/access/service.ts"
import type { Workspace } from "../../lib/data/workspaces.ts"
import type { CanvasReference } from "../../features/access/contracts.ts"

export type CompanyLayoutNode = {
  id: string; resourceId?: string; workspaceId?: string; kind: "container" | "workspace"
  parentId?: string; position: { x: number; y: number }; width: number; height: number
}
type SelectedWorkspace = { workspaceId: string; nodeId: string; width: number; height: number }
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const containerNodeId = (id: string) => `container:${encodeURIComponent(id)}`

/** Associations are view links; they never change task readiness or canonical containment. */
export function projectCanvasReferences(resources: readonly AuthorizedCanvasResource[], references: readonly CanvasReference[]) {
  const records = new Map(resources.map(resource => [resource.id, resource]))
  return [...references].sort((a, b) => compare(a.id, b.id)).flatMap(reference => {
    const source = records.get(reference.canvasResourceId), target = records.get(reference.targetResourceId)
    if (!source || !target || source.organizationId !== target.organizationId) return []
    return [{ id: `association:${encodeURIComponent(reference.id)}`,
      source: source.workspaceId ? workspaceNodeId(source.workspaceId) : containerNodeId(source.id),
      target: target.workspaceId ? workspaceNodeId(target.workspaceId) : containerNodeId(target.id),
      type: "smoothstep", animated: false, label: "Linked", ariaLabel: `Canvas link from ${source.name} to ${target.name}`,
      style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "6 4" } }]
  })
}

/** View-only grid for already-authorized resources. Missing unreadable parents stay absent. */
export function layoutCompanyResources(resources: readonly AuthorizedCanvasResource[], selected?: SelectedWorkspace, workspaces: readonly Pick<Workspace, "id">[] = []): CompanyLayoutNode[] {
  const records = new Map(resources.map(resource => [resource.id, resource]))
  if (records.size !== resources.length) throw new Error("Company layout contains duplicate resources")
  for (const record of resources) {
    const seen = new Set<string>()
    let cursor: AuthorizedCanvasResource | undefined = record
    while (cursor) {
      if (seen.has(cursor.id)) throw new Error("Company layout contains a cycle")
      if (seen.size > MAX_RESOURCE_DEPTH) throw new Error("Company layout exceeds supported hierarchy depth")
      seen.add(cursor.id)
      cursor = cursor.parentId ? records.get(cursor.parentId) : undefined
    }
  }
  const nodes = new Map<string, CompanyLayoutNode>()
  const children = new Map<string, string[]>()
  const idFor = (record: AuthorizedCanvasResource) => record.workspaceId ? workspaceNodeId(record.workspaceId) : containerNodeId(record.id)
  for (const record of resources) {
    const id = idFor(record)
    if (nodes.has(id)) throw new Error("Company layout contains duplicate workspace identity")
    const parent = record.parentId ? records.get(record.parentId) : undefined
    if (parent?.kind === "workspace") throw new Error("Workspace cannot contain company resources")
    const expanded = selected && record.workspaceId === selected.workspaceId
    const node: CompanyLayoutNode = { id, resourceId: record.id, workspaceId: record.workspaceId ?? undefined,
      kind: record.workspaceId ? "workspace" : "container", parentId: parent ? idFor(parent) : undefined,
      position: { x: 0, y: 0 }, width: expanded ? selected.width : 320, height: expanded ? selected.height : 160 }
    nodes.set(id, node)
    if (node.parentId) children.set(node.parentId, [...children.get(node.parentId) ?? [], id])
  }
  if (selected && !resources.some(record => record.workspaceId === selected.workspaceId)) {
    nodes.set(selected.nodeId, { id: selected.nodeId, kind: "workspace", workspaceId: selected.workspaceId,
      position: { x: 0, y: 0 }, width: selected.width, height: selected.height })
  }
  const workspaceIds = new Set<string>()
  for (const workspace of workspaces) {
    if (workspaceIds.has(workspace.id)) throw new Error("Company layout contains duplicate workspace summaries")
    workspaceIds.add(workspace.id)
    const id = workspaceNodeId(workspace.id)
    if (!nodes.has(id)) nodes.set(id, { id, kind: "workspace", workspaceId: workspace.id,
      position: { x: 0, y: 0 }, width: 320, height: 160 })
  }
  const place = (ids: string[], top: number, left: number) => {
    let y = top, width = 0
    for (let index = 0; index < ids.length; index += 2) {
      const row = ids.slice(index, index + 2).map(id => nodes.get(id)!)
      let x = left
      for (const child of row) { child.position = { x, y }; x += child.width + 48 }
      width = Math.max(width, x - 48)
      y += Math.max(...row.map(child => child.height)) + 48
    }
    return { width: Math.max(360, width + left), height: Math.max(180, y) }
  }
  const measure = (id: string) => {
    const descendants = [...children.get(id) ?? []].sort(compare)
    children.set(id, descendants)
    for (const child of descendants) measure(child)
    if (descendants.length) Object.assign(nodes.get(id)!, place(descendants, 112, 24))
  }
  const roots = [...nodes.values()].filter(node => !node.parentId).map(node => node.id).sort(compare)
  for (const root of roots) measure(root)
  place(roots, 0, 0)
  const result: CompanyLayoutNode[] = []
  const append = (id: string) => { result.push(nodes.get(id)!); for (const child of children.get(id) ?? []) append(child) }
  for (const root of roots) append(root)
  return result
}
