import { getDb } from "../../lib/db/client.ts"
import { filterWorkspaces, getAuthorizedCanvasView } from "../access/service.ts"
import { parseCanvasSearch, scopeWorkspaceIds, type CanvasSearchResult } from "./search.ts"

/** ACL facts and search rows share one snapshot; never accept workspace IDs from the client. */
export async function searchCanvasRecords(actorId: string, input: unknown): Promise<CanvasSearchResult[]> {
  const { query, resourceId } = parseCanvasSearch(input)
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const rows = await tx`SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
      WHERE m.user_id=${actorId} AND w.archived_at IS NULL`
    const authorized = await filterWorkspaces(actorId, rows.map(row => ({ id: String(row.id) })), "read", tx)
    const resources = resourceId ? (await getAuthorizedCanvasView(actorId, tx)).resources : []
    const ids = scopeWorkspaceIds(resourceId, resources, authorized.map(row => row.id))
    if (!ids.length) return []
    const matches = await tx`SELECT t.id,t.title,t.workspace_id,w.name AS workspace_name FROM tasks t
      JOIN workspaces w ON w.id=t.workspace_id WHERE t.workspace_id IN ${tx(ids)}
      AND (position(${query.toLowerCase()} in lower(t.title))>0 OR position(${query.toLowerCase()} in lower(coalesce(t.description,'')))>0)
      ORDER BY t.updated_at DESC,t.id ASC LIMIT 20`
    return matches.map(row => ({ id: String(row.id), title: String(row.title), workspaceId: String(row.workspace_id), workspaceName: String(row.workspace_name) }))
  })
}
