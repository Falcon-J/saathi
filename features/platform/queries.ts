import { createHash } from 'node:crypto'
import { getDb } from '../../lib/db/client.ts'
import { listWorkspaces, readWorkspace, type Workspace } from '../../lib/data/workspaces.ts'
import { listTaskRecordsPage, getTaskRecord } from '../../lib/data/tasks.ts'
import { readTaskGraph } from '../../lib/data/task-dependencies.ts'
import { listTaskCommentsPage, type TaskComment } from '../../lib/data/comments.ts'
import { listActivityEventsPage } from '../../lib/data/activity.ts'
import { readInvitationLinkPreview } from '../../lib/data/invitations.ts'
import { getWorkspaceUsage } from '../../lib/usage.ts'
import { normalizeTaskPage, encodeTaskCursor } from '../../lib/task-page.ts'
import type { Task } from '../../lib/task-contract.ts'
import type { PlatformToolName } from './contracts.ts'
import { discoverCapabilities } from './capabilities.ts'
import type { HandlerContext, PlatformHandlers, PlatformPrincipal } from './executor.ts'

function fail(code: 'forbidden' | 'not_found' | 'invalid_input' | 'unavailable'): never { throw Object.assign(new Error(code === 'invalid_input' ? 'Invalid query cursor or input' : 'Record unavailable or access denied'), { code }) }
function grantAllows(principal: PlatformPrincipal, workspaceId: string) { return principal.workspaceIds === null || principal.workspaceIds.includes(workspaceId) }
function requireGrant(principal: PlatformPrincipal, workspaceId: string) { if (!grantAllows(principal, workspaceId)) fail('forbidden') }

export function projectPlatformWorkspace(workspace: Workspace) {
  return { id: workspace.id, name: workspace.name, summary: workspace.summary ?? null, targetAt: workspace.targetAt, ownerUserId: workspace.ownerUserId, version: workspace.version, archivedAt: workspace.archivedAt ?? null, timezone: workspace.timezone }
}
export function projectPlatformTask(task: Task, workspace: Workspace) {
  const assignee = task.assigneeEmail ? workspace.members.find(member => member.email.toLowerCase() === task.assigneeEmail!.toLowerCase()) : null
  if (task.assigneeEmail && !assignee) fail('unavailable')
  if (!task.version) fail('unavailable')
  return { id: task.id, workspaceId: task.workspaceId, title: task.title, description: task.description ?? '', status: task.status ?? (task.completed ? 'done' : 'todo'), priority: task.priority, assigneeUserId: assignee?.userId ?? null, dueDate: task.dueDate ?? null, dueAt: task.dueAt ?? null, estimatedMinutes: task.estimatedMinutes ?? null, version: task.version }
}
export function projectPlatformComment(comment: TaskComment) {
  return { id: comment.id, workspaceId: comment.workspaceId, taskId: comment.taskId, authorUserId: comment.authorUserId, body: comment.body, createdAt: comment.createdAt }
}

// Cursors contain only a boundary and a digest, never addresses, tokens or row payloads.
function scopeDigest(name: string, { input, principal }: HandlerContext) {
  const { cursor: _cursor, ...filters } = input
  if (typeof filters.search === 'string') filters.search = filters.search.trim().toLowerCase()
  const sortedFilters = Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)))
  return createHash('sha256').update(JSON.stringify({ name, actor: principal.userId, client: principal.clientId, grant: principal.grantId, capabilities: [...principal.capabilities].sort(), workspaces: principal.workspaceIds === null ? null : [...principal.workspaceIds].sort(), filters: sortedFilters })).digest('hex')
}
function encodeCursor(scope: string, boundary: string) { return Buffer.from(JSON.stringify({ v: 1, scope, boundary })).toString('base64url') }
function decodeCursor(scope: string, value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('invalid_input')
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (parsed.v !== 1 || parsed.scope !== scope || typeof parsed.boundary !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.boundary) || Object.keys(parsed).length !== 3) fail('invalid_input')
    return parsed.boundary as string
  } catch { fail('invalid_input') }
}
function pageSize(input: Record<string, unknown>) { const limit = input.limit ?? 50; if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) fail('invalid_input'); return Number(limit) }
function pageItems<T extends { id: string }>(items: T[], name: string, context: HandlerContext) {
  const scope = scopeDigest(name, context), boundary = decodeCursor(scope, context.input.cursor), limit = pageSize(context.input)
  const index = boundary ? items.findIndex(item => item.id === boundary) : -1
  if (boundary && index === -1) fail('invalid_input')
  const visible = items.slice(index + 1, index + 1 + limit)
  return { items: visible, nextCursor: items.length > index + 1 + limit ? encodeCursor(scope, visible[visible.length - 1].id) : null }
}

async function activityActorIds(userId: string, workspaceId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await getDb()`SELECT a.id,a.actor_user_id FROM activity_events a WHERE a.workspace_id=${workspaceId} AND a.id IN ${getDb()(ids)}
    AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=a.workspace_id AND m.user_id=${userId})`
  return new Map(rows.map(row => [String(row.id), String(row.actor_user_id)]))
}
async function invitationLinkWorkspace(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(token)) return null
  const hash = createHash('sha256').update(token).digest('hex')
  const [row] = await getDb()`SELECT i.workspace_id FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
    WHERE i.token_hash=${hash} AND i.status='pending' AND i.expires_at>now() AND w.archived_at IS NULL`
  return row ? String(row.workspace_id) : null
}
interface InvitationItem { id: string; workspaceId: string; email: string; status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'; expiresAt: string }
async function invitationPage(principal: PlatformPrincipal, workspaceId: string | undefined, boundary: string | undefined, limit: number): Promise<{ items: InvitationItem[]; nextBoundary: string | null }> {
  // The inbox requires the same separate mailbox proof as the existing invitation DAL.
  // Workspace invitation addresses are visible only to its current active owner.
  return getDb().begin('isolation level repeatable read read only', async tx => {
    if (workspaceId) {
      const [owner] = await tx`SELECT id FROM workspaces WHERE id=${workspaceId} AND owner_user_id=${principal.userId} AND archived_at IS NULL`
      if (!owner) fail('forbidden')
    } else {
      const [proof] = await tx`SELECT u.email FROM auth.users u JOIN invitation_email_verifications v ON v.user_id=u.id AND v.email=lower(u.email) WHERE u.id=${principal.userId}`
      if (!proof) fail('forbidden')
    }
    const allowed = principal.workspaceIds === null ? null : [...principal.workspaceIds]
    if (allowed?.length === 0) return { items: [], nextBoundary: null }
    const rows = await tx`SELECT i.id,i.workspace_id,i.invitee_email,i.status,i.expires_at FROM workspace_invitations i JOIN workspaces w ON w.id=i.workspace_id
      JOIN auth.users u ON u.id=${principal.userId}
      WHERE i.token_hash IS NULL AND w.archived_at IS NULL
      AND (${workspaceId ?? null}::uuid IS NOT NULL AND i.workspace_id=${workspaceId ?? null}::uuid AND w.owner_user_id=u.id
        OR ${workspaceId ?? null}::uuid IS NULL AND i.invitee_email=lower(u.email) AND i.status='pending' AND i.expires_at>now())
      AND (${allowed === null} OR i.workspace_id = ANY(${tx.array(allowed ?? [], 2950)}))
      AND (${boundary ?? null}::uuid IS NULL OR i.id>${boundary ?? null}::uuid)
      ORDER BY i.id ASC LIMIT ${limit + 1}`
    const visible = rows.slice(0, limit)
    return { items: visible.map(row => ({ id: row.id, workspaceId: row.workspace_id, email: row.invitee_email, status: row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : row.status, expiresAt: new Date(row.expires_at).toISOString() })), nextBoundary: rows.length > limit ? visible[visible.length - 1].id : null }
  })
}
const defaults = { listWorkspaces, readWorkspace, listTaskRecordsPage, getTaskRecord, readTaskGraph, listTaskCommentsPage, listActivityEventsPage, readInvitationLinkPreview, getWorkspaceUsage, activityActorIds, invitationLinkWorkspace, invitationPage }
export type PlatformQueryDependencies = typeof defaults & {
  /** Supply executor.listTools(principal) after complete handler composition. */
  listExecutableCapabilities?: (principal: PlatformPrincipal) => readonly { name: string; available: boolean }[]
}

/** Shared read operations; injected DAL implementations are intended for focused tests. */
export function createPlatformQueryHandlers(overrides: Partial<PlatformQueryDependencies> = {}): PlatformHandlers {
  const dal: PlatformQueryDependencies = { ...defaults, ...overrides }
  async function workspaceFor(context: HandlerContext) {
    const workspaceId = String(context.input.workspaceId)
    requireGrant(context.principal, workspaceId)
    const workspace = await dal.readWorkspace(workspaceId, context.principal.userId)
    if (!workspace) fail('not_found')
    return workspace
  }
  const workspaceList = (name: 'workspaces.list' | 'archives.list') => async (context: HandlerContext) => {
    const active = name === 'archives.list' ? [] : await dal.listWorkspaces(context.principal.userId)
    const archived = name === 'archives.list' || context.input.includeArchived ? await dal.listWorkspaces(context.principal.userId, true) : []
    const rows = [...active, ...archived].filter(row => grantAllows(context.principal, row.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return { data: pageItems(rows.map(projectPlatformWorkspace), name, context) }
  }
  const workspaceGet = (archived: boolean) => async (context: HandlerContext) => {
    const row = await workspaceFor(context)
    if (archived && !row.archivedAt) fail('not_found')
    return { data: projectPlatformWorkspace(row), version: row.version }
  }
  const handlers: PlatformHandlers = {
    'workspaces.list': workspaceList('workspaces.list'), 'archives.list': workspaceList('archives.list'),
    'workspaces.get': workspaceGet(false), 'archives.get': workspaceGet(true),
    'members.list': async context => {
      const workspace = await workspaceFor(context)
      const members = workspace.members.map(member => ({ id: member.userId, userId: member.userId, displayName: member.username, role: member.role })).sort((a, b) => a.id.localeCompare(b.id))
      const page = pageItems(members, 'members.list', context)
      return { data: { ...page, items: page.items.map(({ id: _id, ...member }) => member) } }
    },
    'tasks.list': async context => {
      const workspace = await workspaceFor(context), scope = scopeDigest('tasks.list', context), boundary = decodeCursor(scope, context.input.cursor)
      const assignee = context.input.assigneeUserId ? workspace.members.find(member => member.userId === context.input.assigneeUserId) : undefined
      if (context.input.assigneeUserId && !assignee) fail('invalid_input')
      const query = { limit: pageSize(context.input), search: typeof context.input.search === 'string' ? context.input.search : undefined, status: context.input.status === 'done' ? 'completed' as const : context.input.status ? 'active' as const : 'all' as const, assigneeEmail: assignee?.email }
      const normalized = normalizeTaskPage(query)
      const page = await dal.listTaskRecordsPage(context.principal.userId, workspace.id, { ...query, cursor: boundary ? encodeTaskCursor(workspace.id, normalized, boundary) : undefined })
      const nextBoundary = page.nextCursor ? JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8')).boundary as string : null
      return { data: { items: page.tasks.filter(row => !context.input.status || (row.status ?? (row.completed ? 'done' : 'todo')) === context.input.status).map(row => projectPlatformTask(row, workspace)), nextCursor: nextBoundary ? encodeCursor(scope, nextBoundary) : null } }
    },
    'tasks.get': async context => { const workspace = await workspaceFor(context); const task = await dal.getTaskRecord(context.principal.userId, workspace.id, String(context.input.taskId)); return { data: projectPlatformTask(task, workspace), version: task.version } },
    'dependencies.get': async context => { const workspace = await workspaceFor(context); const graph = await dal.readTaskGraph(context.principal.userId, workspace.id); return { data: { workspaceId: workspace.id, edges: graph.dependencies.map(edge => ({ taskId: edge.dependentTaskId, dependsOnTaskId: edge.prerequisiteTaskId })) } } },
    'comments.list': async context => {
      const workspace = await workspaceFor(context), taskId = String(context.input.taskId)
      await dal.getTaskRecord(context.principal.userId, workspace.id, taskId)
      const scope = scopeDigest('comments.list', context)
      const page = await dal.listTaskCommentsPage(context.principal.userId, taskId, decodeCursor(scope, context.input.cursor), pageSize(context.input))
      if (page.comments.some(comment => comment.workspaceId !== workspace.id || comment.taskId !== taskId)) fail('unavailable')
      return { data: { items: page.comments.map(projectPlatformComment), nextCursor: page.nextCursor ? encodeCursor(scope, page.nextCursor) : null } }
    },
    'activity.list': async context => {
      const workspace = await workspaceFor(context), scope = scopeDigest('activity.list', context)
      const page = await dal.listActivityEventsPage(context.principal.userId, workspace.id, decodeCursor(scope, context.input.cursor), pageSize(context.input))
      const actors = await dal.activityActorIds(context.principal.userId, workspace.id, page.events.map(event => event.id))
      return { data: { items: page.events.map(event => { const actorUserId = actors.get(event.id); if (!actorUserId) fail('unavailable'); return { id: event.id, workspaceId: workspace.id, actorUserId, action: event.eventType, resourceId: event.entityId || null, createdAt: event.createdAt } }), nextCursor: page.nextCursor ? encodeCursor(scope, page.nextCursor) : null } }
    },
    'usage.get': async context => { const workspace = await workspaceFor(context); const usage = await dal.getWorkspaceUsage(workspace.id, context.principal.userId); if (!usage) fail('forbidden'); return { data: usage } },
    'capabilities.list': async context => ({ data: { capabilities: (dal.listExecutableCapabilities?.(context.principal) ?? discoverCapabilities({ scopes: context.principal.capabilities }).filter(capability => Boolean(handlers[capability.name as PlatformToolName]))).map(capability => ({ name: capability.name, available: capability.available })) } }),
    'invitation_links.preview': async context => {
      // Possession of this purpose-specific token authorizes only its minimal preview.
      const token = String(context.input.token)
      const workspaceId = await dal.invitationLinkWorkspace(token)
      if (!workspaceId) fail('not_found')
      requireGrant(context.principal, workspaceId)
      const preview = await dal.readInvitationLinkPreview(token)
      if (!preview || preview.status !== 'pending') fail('not_found')
      return { data: { workspaceName: preview.workspaceName, expiresAt: preview.expiresAt, status: preview.status } }
    },
    'invitations.list': async context => {
      const workspaceId = typeof context.input.workspaceId === 'string' ? context.input.workspaceId : undefined
      if (workspaceId) requireGrant(context.principal, workspaceId)
      const scope = scopeDigest('invitations.list', context)
      const page = await dal.invitationPage(context.principal, workspaceId, decodeCursor(scope, context.input.cursor), pageSize(context.input))
      return { data: { items: page.items, nextCursor: page.nextBoundary ? encodeCursor(scope, page.nextBoundary) : null } }
    },
  }
  return handlers
}
