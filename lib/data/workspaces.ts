import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent, flushOutbox } from "./events.ts"

export interface Member {
  id: string; userId: string; email: string; username: string; role: "owner" | "member"; joinedAt: string
}
export interface Workspace {
  id: string; name: string; summary?: string; targetDate?: string | null; targetAt: string | null;
  timezone: string; version: number; members: Member[]; createdAt: string; ownerId: string; ownerUserId: string
}
export interface WorkspaceInput {
  name: string; summary?: string; targetAt?: string | null; targetDate?: string | null; timezone?: string;
  tasks?: { title: string; bucket?: "today" | "next"; dueDate?: string; estimatedMinutes?: number }[]
}

export function validateWorkspace(value: unknown) {
  const parsed = z.object({ name: z.string(), summary: z.string().optional(), targetAt: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(), timezone: z.string().optional() }).safeParse(value)
  if (!parsed.success) throw new Error("Workspace details are invalid")
  const input = parsed.data
  const name = input.name.trim(), summary = input.summary?.trim() || null
  if (!name || name.length > 100) throw new Error("Workspace name must contain 1 to 100 characters")
  if (summary && summary.length > 240) throw new Error("Workspace summary cannot exceed 240 characters")
  const timezone = input.timezone ?? "UTC"
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format() }
  catch { throw new Error("Workspace timezone is invalid") }
  const target = input.targetAt !== undefined ? input.targetAt : input.targetDate
  if (target && Number.isNaN(Date.parse(target))) throw new Error("Workspace target date is invalid")
  return { name, summary, timezone, targetAt: target ? new Date(target).toISOString() : null }
}

const timestamp = (value: Date | string) => new Date(value).toISOString()

export async function readWorkspace(workspaceId: string, userId: string, tx: ReturnType<typeof getDb> | Transaction = getDb()): Promise<Workspace | null> {
  const rows = await tx`SELECT w.*, u.email AS owner_email FROM workspaces w JOIN auth.users u ON u.id = w.owner_user_id
    WHERE w.id = ${workspaceId} AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = ${userId})`
  const row = rows[0]
  if (!row) return null
  const members = await tx`SELECT m.user_id, m.joined_at, p.username, u.email FROM workspace_members m
    JOIN profiles p ON p.id = m.user_id JOIN auth.users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} ORDER BY m.joined_at, m.user_id`
  const targetAt = row.target_at ? timestamp(row.target_at) : null
  return { id: row.id, name: row.name, summary: row.summary ?? undefined, targetAt, targetDate: targetAt,
    timezone: row.timezone, version: row.version, createdAt: timestamp(row.created_at), ownerId: row.owner_email,
    ownerUserId: row.owner_user_id,
    members: members.map(m => ({ id: m.email, userId: m.user_id, email: m.email, username: m.username,
      role: m.user_id === row.owner_user_id ? "owner" : "member", joinedAt: timestamp(m.joined_at) })) }
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const rows = await tx`SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = ${userId} AND w.archived_at IS NULL ORDER BY w.created_at DESC`
    const result: Workspace[] = []
    for (const row of rows) {
      const workspace = await readWorkspace(row.id, userId, tx)
      if (workspace) result.push(workspace)
    }
    return result
  })
}

export async function createWorkspaceRecord(userId: string, input: WorkspaceInput): Promise<Workspace> {
  const data = validateWorkspace(input), id = randomUUID()
  const plan = z.array(z.object({ title: z.string().trim().min(1).max(200), bucket: z.enum(["today", "next"]).optional(),
    dueDate: z.string().refine(value => !Number.isNaN(Date.parse(value))).optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).optional() }).strict()).max(20).safeParse(input.tasks ?? [])
  if (!plan.success) throw new Error("Workspace plan is invalid; use at most 20 tasks with valid titles and estimates")
  const tasks = plan.data
  const workspace = await getDb().begin(async tx => {
    await tx`INSERT INTO workspaces (id, name, summary, target_at, timezone, owner_user_id)
      VALUES (${id}, ${data.name}, ${data.summary}, ${data.targetAt}, ${data.timezone}, ${userId})`
    await tx`INSERT INTO workspace_members (workspace_id, user_id) VALUES (${id}, ${userId})`
    for (const task of tasks) {
      const taskId = randomUUID()
      await tx`INSERT INTO tasks (id, workspace_id, title, bucket, due_date, estimated_minutes, created_by_user_id)
        VALUES (${taskId}, ${id}, ${task.title.trim()}, ${task.bucket ?? null}, ${task.dueDate ?? null},
          ${task.estimatedMinutes ?? null}, ${userId})`
      await appendDomainEvent(tx, { workspaceId: id, actorUserId: userId, type: "task-created", entityType: "task", entityId: taskId })
    }
    await appendDomainEvent(tx, { workspaceId: id, actorUserId: userId, type: "workspace-created", entityType: "workspace", entityId: id })
    return (await readWorkspace(id, userId, tx))!
  })
  await flushOutbox(id)
  return workspace
}

export async function requireWorkspaceOwner(tx: Transaction, workspaceId: string, userId: string) {
  const rows = await tx`SELECT * FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`
  if (!rows[0] || rows[0].owner_user_id !== userId) throw new Error("Only workspace owner can manage this workspace")
  return rows[0]
}

export async function updateWorkspaceRecord(userId: string, workspaceId: string, input: WorkspaceInput, expectedVersion: number): Promise<Workspace> {
  const data = validateWorkspace(input)
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("Workspace version is required")
  const workspace = await getDb().begin(async tx => {
    const row = await requireWorkspaceOwner(tx, workspaceId, userId)
    if (row.archived_at) throw new Error("Archived workspaces cannot be edited")
    if (row.version !== expectedVersion) throw new Error("Workspace changed. Refresh and try again.")
    await tx`UPDATE workspaces SET name = ${data.name}, summary = ${data.summary}, target_at = ${data.targetAt},
      timezone = ${data.timezone}, version = version + 1, updated_at = now() WHERE id = ${workspaceId} AND version = ${expectedVersion}`
    await appendDomainEvent(tx, { workspaceId, actorUserId: userId, type: "workspace-updated", entityType: "workspace", entityId: workspaceId,
      metadata: { action: "workspace_updated" } })
    return (await readWorkspace(workspaceId, userId, tx))!
  })
  await flushOutbox(workspaceId)
  return workspace
}

export async function archiveWorkspaceRecord(userId: string, workspaceId: string, expectedVersion: number): Promise<void> {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("Workspace version is required")
  await getDb().begin(async tx => {
    const row = await requireWorkspaceOwner(tx, workspaceId, userId)
    if (row.archived_at) throw new Error("Workspace is already archived")
    if (row.version !== expectedVersion) throw new Error("Workspace changed. Refresh and try again.")
    await tx`UPDATE workspaces SET archived_at = now(), version = version + 1, updated_at = now()
      WHERE id = ${workspaceId} AND version = ${expectedVersion} AND archived_at IS NULL`
    await appendDomainEvent(tx, { workspaceId, actorUserId: userId, type: "workspace-updated", entityType: "workspace", entityId: workspaceId,
      metadata: { action: "workspace_archived" } })
  })
  await flushOutbox(workspaceId)
}

export async function transferWorkspaceOwnershipRecord(userId: string, workspaceId: string, newOwnerUserId: string, expectedVersion: number): Promise<void> {
  if (!newOwnerUserId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("Workspace ownership transfer is invalid")
  await getDb().begin(async tx => {
    const row = await requireWorkspaceOwner(tx, workspaceId, userId)
    if (row.archived_at) throw new Error("Archived workspaces cannot transfer ownership")
    if (row.version !== expectedVersion) throw new Error("Workspace changed. Refresh and try again.")
    if (newOwnerUserId === userId) throw new Error("Choose another workspace member")
    const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${newOwnerUserId}`
    if (!member) throw new Error("New owner must already be a workspace member")
    await tx`UPDATE workspaces SET owner_user_id = ${newOwnerUserId}, version = version + 1, updated_at = now()
      WHERE id = ${workspaceId} AND version = ${expectedVersion}`
    await appendDomainEvent(tx, { workspaceId, actorUserId: userId, type: "workspace-updated", entityType: "workspace", entityId: workspaceId,
      metadata: { action: "ownership_transferred" } })
  })
  await flushOutbox(workspaceId)
}

export async function removeWorkspaceMember(userId: string, workspaceId: string, memberEmail: string): Promise<void> {
  await getDb().begin(async tx => {
    const rows = await tx`SELECT * FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`
    const row = rows[0]
    if (!row) throw new Error("Workspace not found")
    const members = await tx`SELECT m.user_id FROM workspace_members m JOIN auth.users u ON u.id = m.user_id
      WHERE m.workspace_id = ${workspaceId} AND lower(u.email) = ${memberEmail.trim().toLowerCase()}`
    const member = members[0]
    if (!member) throw new Error("Member not found in this workspace")
    if (row.owner_user_id !== userId && member.user_id !== userId) throw new Error("Only workspace owner can remove other members")
    if (member.user_id === row.owner_user_id) throw new Error("Transfer ownership before leaving, or delete the workspace")
    await tx`UPDATE tasks SET assignee_user_id = NULL, version = version + 1, updated_at = now()
      WHERE workspace_id = ${workspaceId} AND assignee_user_id = ${member.user_id}`
    await tx`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${member.user_id}`
    await appendDomainEvent(tx, { workspaceId, actorUserId: userId, type: "member-removed", entityType: "profile", entityId: member.user_id,
      payload: { memberEmail: memberEmail.trim().toLowerCase() } })
  })
  await flushOutbox(workspaceId)
}

export async function deleteWorkspaceRecord(userId: string, workspaceId: string): Promise<void> {
  await getDb().begin(async tx => {
    await requireWorkspaceOwner(tx, workspaceId, userId)
    await appendDomainEvent(tx, { workspaceId, actorUserId: userId, type: "member-removed", entityType: "workspace", entityId: workspaceId,
      metadata: { action: "workspace_deleted" }, payload: { deleted: true } })
    await tx`DELETE FROM workspaces WHERE id = ${workspaceId}`
  })
  await flushOutbox(workspaceId)
}
