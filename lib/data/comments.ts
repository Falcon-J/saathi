import { commandHash, readCommandReceipt, saveCommandReceipt } from "./command-receipts.ts"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent } from "./events.ts"
import { TaskError } from "./tasks.ts"
import type { Row } from "postgres"

export interface TaskComment {
  id: string
  workspaceId: string
  taskId: string
  authorUserId: string
  authorEmail: string
  body: string
  createdAt: string
}

const commentBodySchema = z.string().trim().min(1, "Comment is required").max(2000, "Comment is too long")
const iso = (value: Date | string) => new Date(value).toISOString()

async function projectComment(db: ReturnType<typeof getDb> | Transaction, id: string): Promise<TaskComment> {
  const [row] = await db`SELECT c.*, u.email AS author_email
    FROM task_comments c JOIN auth.users u ON u.id = c.author_user_id
    WHERE c.id = ${id}`
  if (!row) throw new TaskError("Comment not found")
  return mapComment(row)
}

function mapComment(row: Row): TaskComment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    authorUserId: row.author_user_id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: iso(row.created_at),
  }
}

async function authorizedTask(tx: Transaction, actorId: string, taskId: string, forWrite = true) {
  const [task] = await tx`SELECT t.id, t.workspace_id, w.archived_at
    FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
    WHERE t.id = ${taskId}`
  if (!task) throw new TaskError("Workspace unavailable or access denied", "forbidden")
  if (forWrite) {
    // Use the same lock order as task edits and member removal. Recheck archive
    // state after acquiring the workspace lock, not from the earlier lookup.
    const [workspace] = await tx`SELECT archived_at FROM workspaces WHERE id = ${task.workspace_id} FOR UPDATE`
    if (!workspace || workspace.archived_at) throw new TaskError("Workspace unavailable or access denied", "forbidden")
    const [currentTask] = await tx`SELECT id FROM tasks WHERE id = ${taskId} AND workspace_id = ${task.workspace_id} FOR UPDATE`
    if (!currentTask) throw new TaskError("Workspace unavailable or access denied", "forbidden")
  }
  const [member] = await tx`SELECT user_id FROM workspace_members
    WHERE workspace_id = ${task.workspace_id} AND user_id = ${actorId}`
  if (!member) throw new TaskError("Workspace unavailable or access denied", "forbidden")
  return task
}

export async function listTaskComments(actorId: string, taskId: string): Promise<TaskComment[]> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const task = await authorizedTask(tx, actorId, taskId, false)
    const rows = await tx`SELECT c.*, u.email AS author_email FROM task_comments c
      JOIN auth.users u ON u.id = c.author_user_id
      WHERE c.workspace_id = ${task.workspace_id} AND c.task_id = ${taskId}
      ORDER BY c.created_at ASC, c.id ASC`
    return rows.map(mapComment)
  })
}

export interface CommentPage { comments: TaskComment[]; nextCursor: string | null }

/** Newest page first; rows within each page remain chronological for display. */
export async function listTaskCommentsPage(actorId: string, taskId: string, cursor?: string, limit = 50): Promise<CommentPage> {
  if (cursor && !z.string().uuid().safeParse(cursor).success) throw new TaskError("Invalid comment cursor", "validation")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TaskError("Invalid comment page size", "validation")
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const task = await authorizedTask(tx, actorId, taskId, false)
    if (cursor) {
      const [boundary] = await tx`SELECT id FROM task_comments WHERE id=${cursor} AND task_id=${taskId} AND workspace_id=${task.workspace_id}`
      if (!boundary) throw new TaskError("Comment cursor unavailable", "validation")
    }
    const rows = await tx`SELECT c.*, u.email AS author_email FROM task_comments c
      JOIN auth.users u ON u.id = c.author_user_id
      WHERE c.workspace_id = ${task.workspace_id} AND c.task_id = ${taskId}
        AND (${cursor ?? null}::uuid IS NULL OR (c.created_at, c.id) <
          (SELECT created_at, id FROM task_comments WHERE id=${cursor ?? null}::uuid AND task_id=${taskId}))
      ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit + 1}`
    const visible = rows.slice(0, limit)
    return { comments: visible.map(mapComment).reverse(), nextCursor: rows.length > limit ? visible[visible.length - 1].id : null }
  })
}

export async function createTaskComment(actorId: string, taskId: string, body: string, commandId?: string): Promise<TaskComment> {
  const parsed = commentBodySchema.safeParse(body)
  if (!parsed.success) throw new TaskError(parsed.error.issues[0]?.message ?? "Comment is invalid", "validation")

  if (commandId && !z.string().uuid().safeParse(commandId).success) throw new TaskError("Invalid command identifier", "validation")
  const hash = commandHash({ taskId, body: parsed.data })
  const id = randomUUID()
  const comment = await getDb().begin(async tx => {
    const task = await authorizedTask(tx, actorId, taskId)
    if (commandId) {
      let receipt: TaskComment | null
      try { receipt = await readCommandReceipt<TaskComment>(tx, task.workspace_id, actorId, commandId, "comment-create", hash) }
      catch (error) { if (error instanceof Error && error.message.includes("already used")) throw new TaskError(error.message, "conflict"); throw error }
      if (receipt) return receipt
    }
    await tx`INSERT INTO task_comments (id, workspace_id, task_id, author_user_id, body)
      VALUES (${id}, ${task.workspace_id}, ${taskId}, ${actorId}, ${parsed.data})`
    const created = await projectComment(tx, id)
    await appendDomainEvent(tx, {
      workspaceId: task.workspace_id,
      actorUserId: actorId,
      type: "task-comment-created",
      entityType: "task_comment",
      entityId: id,
      metadata: { bodyLength: created.body.length },
      payload: { taskId, commentId: id },
    })
    if (commandId) await saveCommandReceipt(tx, task.workspace_id, actorId, commandId, "comment-create", hash, created)
    return created
  })
  return comment
}
