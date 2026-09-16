import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent, flushOutbox } from "./events.ts"
import { TaskError } from "./tasks.ts"

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

async function authorizedTask(tx: Transaction, actorId: string, taskId: string, lock = true) {
  const [task] = lock
    ? await tx`SELECT t.id, t.workspace_id, w.archived_at
        FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
        WHERE t.id = ${taskId} FOR UPDATE`
    : await tx`SELECT t.id, t.workspace_id, w.archived_at
        FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
        WHERE t.id = ${taskId}`
  if (!task || task.archived_at) throw new TaskError("Workspace unavailable or access denied")
  const [member] = await tx`SELECT user_id FROM workspace_members
    WHERE workspace_id = ${task.workspace_id} AND user_id = ${actorId}`
  if (!member) throw new TaskError("Workspace unavailable or access denied")
  return task
}

export async function listTaskComments(actorId: string, taskId: string): Promise<TaskComment[]> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const task = await authorizedTask(tx, actorId, taskId, false)
    const rows = await tx`SELECT c.id FROM task_comments c
      WHERE c.workspace_id = ${task.workspace_id} AND c.task_id = ${taskId}
      ORDER BY c.created_at ASC, c.id ASC`
    return Promise.all(rows.map(row => projectComment(tx, row.id)))
  })
}

export async function createTaskComment(actorId: string, taskId: string, body: string): Promise<TaskComment> {
  const parsed = commentBodySchema.safeParse(body)
  if (!parsed.success) throw new TaskError(parsed.error.issues[0]?.message ?? "Comment is invalid")

  const id = randomUUID()
  const comment = await getDb().begin(async tx => {
    const task = await authorizedTask(tx, actorId, taskId)
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
    return created
  })
  await flushOutbox(comment.workspaceId)
  return comment
}
