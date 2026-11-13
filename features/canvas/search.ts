import { z } from "zod"
import type { CanvasResourcePath } from "./model.ts"

export type CanvasSearchResult = { id: string; title: string; workspaceId: string; workspaceName: string }
export const parseCanvasSearch = (input: unknown) => z.object({
  query: z.string().trim().min(2).max(120),
  resourceId: z.string().uuid().optional(),
}).strict().parse(input)

export function scopeWorkspaceIds(resourceId: string | undefined, resources: readonly Pick<CanvasResourcePath, "id" | "parentId" | "workspaceId">[], authorized: readonly string[]): string[] {
  if (!resourceId) return [...authorized]
  const allowed = new Set(authorized), records = new Map(resources.map(record => [record.id, record]))
  if (!records.has(resourceId)) return []
  return resources.filter(record => {
    const seen = new Set<string>()
    let cursor: typeof record | undefined = record
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === resourceId) return Boolean(record.workspaceId && allowed.has(record.workspaceId))
      seen.add(cursor.id); cursor = cursor.parentId ? records.get(cursor.parentId) : undefined
    }
    return false
  }).flatMap(record => record.workspaceId ? [record.workspaceId] : [])
}
