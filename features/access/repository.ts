import { getDb, type Transaction } from "../../lib/db/client.ts"
import { accessGraphSchema, type AccessGraph, type AccessResource } from "./contracts.ts"
import { createAccessResolver } from "./policy.ts"

export type CanvasResourceRecord = AccessResource & { organizationId: string; name: string; workspaceId: string | null; version: number }
export type AccessSnapshot = {
  graph: AccessGraph
  records: CanvasResourceRecord[]
  workspaceMemberships: Array<{ workspaceId: string; resourceId: string | null; member: boolean }>
  asOf: string
}
export type AccessDatabase = ReturnType<typeof getDb> | Transaction

/** One MVCC statement loads current membership, canonical ancestors and relevant policy facts.
 * The recursive walk stops after 17 parent edges; corrupt cycles/depth are rejected by policy.
 */
export async function loadAccessSnapshot(actorId: string, options: { workspaceIds?: string[]; resourceIds?: string[] } = {}, db: AccessDatabase = getDb()): Promise<AccessSnapshot> {
  const workspaceIds = options.workspaceIds ?? []
  const resourceIds = options.resourceIds ?? []
  const allResources = options.workspaceIds === undefined && options.resourceIds === undefined
  const [row] = await db`WITH RECURSIVE current_actor AS MATERIALIZED (
    SELECT ${actorId}::uuid AS id
  ), requested_workspaces AS MATERIALIZED (
    SELECT w.id AS workspace_id,r.id AS resource_id,
      EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=(SELECT id FROM current_actor)) AS member
    FROM workspaces w LEFT JOIN canvas_resources r ON r.workspace_id=w.id
    WHERE ((${allResources} AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=(SELECT id FROM current_actor)))
      OR w.id=ANY(${db.array(workspaceIds,2950)}) OR r.id=ANY(${db.array(resourceIds,2950)}))
    LIMIT 10001
  ), seeds AS MATERIALIZED (
    SELECT r.* FROM canvas_resources r WHERE (
      (${allResources} AND EXISTS(SELECT 1 FROM canvas_organization_members om WHERE om.organization_id=r.organization_id AND om.user_id=(SELECT id FROM current_actor) AND om.revoked_at IS NULL))
      OR r.id=ANY(${db.array(resourceIds,2950)}) OR r.workspace_id=ANY(${db.array(workspaceIds,2950)}))
      AND (r.kind<>'workspace' OR EXISTS(SELECT 1 FROM requested_workspaces w WHERE w.workspace_id=r.workspace_id AND w.member))
    LIMIT 10001
  ), walk AS (
    SELECT s.*,ARRAY[s.id] AS path,0 AS depth,false AS cycle FROM seeds s
    UNION ALL
    SELECT p.*,w.path||p.id,w.depth+1,p.id=ANY(w.path) FROM walk w
      JOIN canvas_resources p ON p.id=w.parent_id AND p.organization_id=w.organization_id
      WHERE w.depth<17 AND NOT w.cycle
  ), resources AS MATERIALIZED (
    SELECT DISTINCT id,organization_id,parent_id,kind,name,workspace_id,policy_mode,version FROM walk LIMIT 10001
  ), relevant_grants AS MATERIALIZED (
    SELECT g.* FROM canvas_resource_grants g JOIN resources r ON r.id=g.resource_id
      JOIN canvas_organization_members om ON om.organization_id=g.organization_id AND om.user_id=(SELECT id FROM current_actor) AND om.revoked_at IS NULL
    WHERE g.user_id=(SELECT id FROM current_actor) OR g.group_id IN (SELECT group_id FROM canvas_group_members WHERE user_id=(SELECT id FROM current_actor))
    LIMIT 50001
  ), memberships AS MATERIALIZED (
    SELECT gm.* FROM canvas_group_members gm JOIN canvas_organization_members om
      ON om.organization_id=gm.organization_id AND om.user_id=gm.user_id AND om.revoked_at IS NULL
    WHERE gm.user_id=(SELECT id FROM current_actor) AND gm.organization_id IN (SELECT organization_id FROM resources) LIMIT 50001
  ), visible_references AS MATERIALIZED (
    SELECT v.id,v.canvas_resource_id,v.target_resource_id FROM canvas_references v
      JOIN resources source ON source.id=v.canvas_resource_id AND source.organization_id=v.organization_id
      JOIN resources target ON target.id=v.target_resource_id AND target.organization_id=v.organization_id
    LIMIT 50001
  ) SELECT statement_timestamp() AS as_of,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'parentId',r.parent_id,'kind',r.kind,'mode',r.policy_mode)) FROM resources r),'[]'::jsonb) AS resources,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'organizationId',r.organization_id,'parentId',r.parent_id,'kind',r.kind,'mode',r.policy_mode,
      'workspaceId',r.workspace_id,'name',COALESCE(w.name,r.name),'version',r.version)) FROM resources r LEFT JOIN workspaces w ON w.id=r.workspace_id),'[]'::jsonb) AS records,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'resourceId',g.resource_id,
      'principal',jsonb_build_object('kind',CASE WHEN g.user_id IS NOT NULL THEN 'user' ELSE 'group' END,'id',COALESCE(g.user_id,g.group_id)),
      'capabilities',g.capabilities,'expiresAt',g.expires_at,'revokedAt',g.revoked_at)) FROM relevant_grants g),'[]'::jsonb) AS grants,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('organizationId',m.organization_id,'groupId',m.group_id,'userId',m.user_id,'revokedAt',m.revoked_at)) FROM memberships m),'[]'::jsonb) AS memberships,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('workspaceId',w.workspace_id,'resourceId',w.resource_id,'member',w.member)) FROM requested_workspaces w),'[]'::jsonb) AS workspace_memberships,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'canvasResourceId',v.canvas_resource_id,'targetResourceId',v.target_resource_id)) FROM visible_references v),'[]'::jsonb) AS reference_records,
    EXISTS(SELECT 1 FROM walk WHERE cycle OR depth>16) AS invalid_walk`
  if (!row || row.invalid_walk) throw new Error("Invalid canvas authorization hierarchy")
  const graph: AccessGraph = { resources: row.resources, grants: row.grants, memberships: row.memberships, references: row.reference_records }
  const asOf = new Date(row.as_of).toISOString()
  if (!accessGraphSchema.safeParse(graph).success || row.workspace_memberships.length > 10_000) throw new Error("Canvas authorization snapshot exceeds supported bounds or contains invalid facts")
  const first = graph.resources[0]
  if (first && createAccessResolver(graph, new Date(asOf))(first.id, { kind: "user", userId: actorId }).reason === "invalid_graph") throw new Error("Invalid canvas authorization hierarchy")
  return { graph, records: row.records, workspaceMemberships: row.workspace_memberships, asOf }
}
