import { taskDeadline } from "../task-deadline.ts"
import { z } from "zod"
import { commandHash, readCommandReceipt, saveCommandReceipt } from "./command-receipts.ts"
import { randomUUID } from "node:crypto"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent } from "./events.ts"
import { normalizeTaskUpdates, type TaskUpdate, type Task } from "../task-contract.ts"
import { canChangeTask, matchesTaskVersion } from "../task-permission.ts"
import type { Row } from "postgres"
import { normalizeTaskPage, encodeTaskCursor, decodeTaskCursor, type TaskPageInput, type TaskPage, type TaskAggregates } from "../task-page.ts"

export type TaskErrorCode = "unauthenticated" | "forbidden" | "validation" | "not_found" | "conflict" | "unavailable"
export class TaskError extends Error {
  readonly code: TaskErrorCode
  constructor(message: string, code: TaskErrorCode = "unavailable") {
    super(message)
    this.code = code
  }
}
const iso = (value: Date | string) => new Date(value).toISOString()
const calendarDate = (value: Date | string | null | undefined) => {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0]
}
type Db = ReturnType<typeof getDb> | Transaction

async function projectTask(db: Db, id: string): Promise<Task> {
  const [row] = await db`SELECT t.*, creator.email AS creator_email, assignee.email AS assignee_email
    FROM tasks t JOIN auth.users creator ON creator.id = t.created_by_user_id
    LEFT JOIN auth.users assignee ON assignee.id = t.assignee_user_id WHERE t.id = ${id}`
  if (!row) throw new TaskError("Task not found", "not_found")
  return mapTask(row)
}
function mapTask(row: Row): Task {
  return { id: row.id, workspaceId: row.workspace_id, title: row.title, description: row.description ?? undefined,
    status: row.status === "in_progress" ? "in-progress" : row.status, completed: row.status === "done",
    dueDate: calendarDate(row.due_date), priority: row.priority, bucket: row.bucket ?? undefined, dueAt: row.due_at ? iso(row.due_at) : undefined,
    estimatedMinutes: row.estimated_minutes ?? undefined, assigneeEmail: row.assignee_email ?? undefined,
    createdBy: row.creator_email, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: row.version }
}
async function lockWorkspace(tx: Transaction, workspaceId: string, actorId: string) {
  const [workspace] = await tx`SELECT * FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`
  const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${actorId}`
  if (!workspace || !member || workspace.archived_at) throw new TaskError("Workspace unavailable or access denied", "forbidden")
  return workspace
}
async function assigneeId(tx: Transaction, workspaceId: string, email?: string) {
  if (!email) return null
  const [member] = await tx`SELECT m.user_id FROM workspace_members m JOIN auth.users u ON u.id=m.user_id
    WHERE m.workspace_id=${workspaceId} AND lower(u.email)=${email.trim().toLowerCase()}`
  if (!member) throw new TaskError("Task assignee must be a workspace member", "validation")
  return member.user_id as string
}
export async function listTaskRecords(actorId: string, workspaceId: string): Promise<Task[]> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id=${workspaceId} AND user_id=${actorId}`
    if (!member) throw new TaskError("Workspace unavailable or access denied", "forbidden")
    const rows = await tx`SELECT t.*, creator.email AS creator_email, assignee.email AS assignee_email
      FROM tasks t JOIN auth.users creator ON creator.id = t.created_by_user_id
      LEFT JOIN auth.users assignee ON assignee.id = t.assignee_user_id
      WHERE t.workspace_id=${workspaceId} ORDER BY t.created_at DESC, t.id ASC`
    return rows.map(mapTask)
  })
}
async function authorizeTaskRead(tx: Transaction, actorId: string, workspaceId: string) {
  const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id=${workspaceId} AND user_id=${actorId}`
  if (!member) throw new TaskError("Workspace unavailable or access denied", "forbidden")
}
export async function listTaskRecordsPage(actorId: string, workspaceId: string, input: TaskPageInput = {}): Promise<TaskPage> {
  let scope, boundary: string | null = null
  try {
    z.string().uuid().parse(workspaceId)
    scope = normalizeTaskPage(input)
    if(scope.cursor) boundary = decodeTaskCursor(scope.cursor,workspaceId,scope)
  } catch { throw new TaskError("Invalid task page or cursor", "validation") }
  return getDb().begin("isolation level repeatable read read only", async tx => {
    await authorizeTaskRead(tx,actorId,workspaceId)
    if(boundary) {
      const [row] = await tx`SELECT id FROM tasks WHERE id=${boundary} AND workspace_id=${workspaceId}`
      if(!row) throw new TaskError("Task cursor unavailable", "validation")
    }
    const rows = await tx`SELECT t.*, creator.email AS creator_email, assignee.email AS assignee_email
      FROM tasks t JOIN auth.users creator ON creator.id=t.created_by_user_id
      LEFT JOIN auth.users assignee ON assignee.id=t.assignee_user_id
      WHERE t.workspace_id=${workspaceId}
        AND (${scope.status}='all' OR (${scope.status}='active' AND t.status<>'done') OR (${scope.status}='completed' AND t.status='done'))
        AND (${scope.priority}::text IS NULL OR t.priority=${scope.priority})
        AND (${scope.assigneeEmail}::text IS NULL OR lower(assignee.email)=${scope.assigneeEmail})
        AND (${scope.search}='' OR position(${scope.search} in lower(t.title))>0 OR position(${scope.search} in lower(coalesce(t.description,'')))>0)
        AND (${boundary}::uuid IS NULL OR t.created_at < (SELECT created_at FROM tasks WHERE id=${boundary}::uuid AND workspace_id=${workspaceId})
          OR (t.created_at = (SELECT created_at FROM tasks WHERE id=${boundary}::uuid AND workspace_id=${workspaceId}) AND t.id>${boundary}::uuid))
      ORDER BY t.created_at DESC,t.id ASC LIMIT ${scope.limit+1}`
    const visible=rows.slice(0,scope.limit)
    return {tasks:visible.map(mapTask),nextCursor:rows.length>scope.limit ? encodeTaskCursor(workspaceId,scope,visible[visible.length-1].id) : null}
  })
}
export async function getTaskRecord(actorId: string, workspaceId: string, taskId: string): Promise<Task> {
  if(!z.string().uuid().safeParse(workspaceId).success || !z.string().uuid().safeParse(taskId).success) throw new TaskError("Invalid task identifier","validation")
  return getDb().begin("isolation level repeatable read read only",async tx => {
    await authorizeTaskRead(tx,actorId,workspaceId)
    const [row]=await tx`SELECT id FROM tasks WHERE workspace_id=${workspaceId} AND id=${taskId}`
    if(!row) throw new TaskError("Task not found","not_found")
    return projectTask(tx,taskId)
  })
}
export async function getTaskAggregates(actorId: string, workspaceId: string): Promise<TaskAggregates> {
  if(!z.string().uuid().safeParse(workspaceId).success) throw new TaskError("Invalid workspace identifier","validation")
  return getDb().begin("isolation level repeatable read read only",async tx => {
    await authorizeTaskRead(tx,actorId,workspaceId)
    const [row]=await tx`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE status='todo')::int AS todo, count(*) FILTER(WHERE status='in_progress')::int AS progress,
      count(*) FILTER(WHERE status='done')::int AS done, count(*) FILTER(WHERE priority='low')::int AS low,
      count(*) FILTER(WHERE priority='medium')::int AS medium, count(*) FILTER(WHERE priority='high')::int AS high,
      count(*) FILTER(WHERE status<>'done' AND (due_at < now() OR (due_at IS NULL AND due_date < (now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=${workspaceId}))::date)))::int AS overdue
      FROM tasks WHERE workspace_id=${workspaceId}`
    return {total:row.total,open:row.total-row.done,done:row.done,overdue:row.overdue,byStatus:{todo:row.todo,"in-progress":row.progress,done:row.done},byPriority:{low:row.low,medium:row.medium,high:row.high}}
  })
}
export async function createTaskRecord(actorId: string, workspaceId: string, input: TaskUpdate, commandId?: string): Promise<Task> {
  const result = normalizeTaskUpdates(input)
  if (!result.updates?.title) throw new TaskError(result.error ?? "Task title is required", "validation")
  const data = result.updates, id = randomUUID()
  if (commandId && !z.string().uuid().safeParse(commandId).success) throw new TaskError("Invalid command identifier", "validation")
  const hash = commandHash(data)
  const deadline = validatedDeadline(data)
  const task = await getDb().begin(async tx => {
    await lockWorkspace(tx, workspaceId, actorId)
    if (commandId) {
      let receipt: Task | null
      try { receipt = await readCommandReceipt<Task>(tx, workspaceId, actorId, commandId, "task-create", hash) }
      catch (error) { if (error instanceof Error && error.message.includes("already used")) throw new TaskError(error.message, "conflict"); throw error }
      if (receipt) return receipt
    }
    const assignee = await assigneeId(tx, workspaceId, data.assigneeEmail)
    await tx`INSERT INTO tasks (id,workspace_id,title,description,priority,bucket,due_at,due_date,estimated_minutes,assignee_user_id,created_by_user_id)
      VALUES (${id},${workspaceId},${data.title!},${data.description ?? null},${data.priority ?? "medium"},${data.bucket ?? null},
        ${deadline.instant},${deadline.date},${data.estimatedMinutes ?? null},${assignee},${actorId})`
    const created = await projectTask(tx, id)
    await appendDomainEvent(tx, {workspaceId,actorUserId:actorId,type:"task-created",entityType:"task",entityId:id,payload:{task:created}})
    if (commandId) await saveCommandReceipt(tx, workspaceId, actorId, commandId, "task-create", hash, created)
    return created
  })
  return task
}
export async function changeTaskRecord(actorId: string, id: string, action: "edit" | "toggle" | "delete", input: TaskUpdate, expected?: string | number): Promise<Task> {
  const result = action === "edit" ? normalizeTaskUpdates(input) : {updates: {}}
  if (!result.updates) throw new TaskError(result.error ?? "Invalid task update", "validation")
  const normalized = result.updates
  const task = await getDb().begin(async tx => {
    const [location] = await tx`SELECT workspace_id FROM tasks WHERE id=${id}`
    if (!location) throw new TaskError("Task not found", "not_found")
    const workspace = await lockWorkspace(tx, location.workspace_id, actorId)
    const [row] = await tx`SELECT * FROM tasks WHERE id=${id} FOR UPDATE`
    if (!row) throw new TaskError("Task not found", "not_found")
    if (!canChangeTask({ownerId:workspace.owner_user_id,creatorId:row.created_by_user_id,assigneeId:row.assignee_user_id},actorId,action)) throw new TaskError("Access denied for this task action", "forbidden")
    if (!matchesTaskVersion(row.version, iso(row.updated_at), expected)) throw new TaskError("Task changed by another teammate. Refresh before saving.", "conflict")
    const old = await projectTask(tx,id)
    if (action === "delete") {
      await tx`DELETE FROM tasks WHERE id=${id} AND version=${row.version}`
      await appendDomainEvent(tx,{workspaceId:row.workspace_id,actorUserId:actorId,type:"task-deleted",entityType:"task",entityId:id,payload:{taskId:id}})
      return old
    }
    const data: TaskUpdate = normalized
    const owns = (key: keyof TaskUpdate) => Object.prototype.hasOwnProperty.call(data,key)
    const assigned = owns("assigneeEmail") ? await assigneeId(tx,row.workspace_id,data.assigneeEmail) : row.assignee_user_id
    const status = action === "toggle" ? (row.status === "done" ? "todo" : "done") : (data.status?.replace("-","_") ?? row.status)
    const deadline = owns("dueAt") || owns("dueDate") ? validatedDeadline(data) : { instant: row.due_at, date: row.due_date }
    await tx`UPDATE tasks SET title=${data.title ?? row.title}, description=${owns("description") ? data.description ?? null : row.description},
      priority=${data.priority ?? row.priority}, status=${status}, bucket=${data.bucket ?? row.bucket}, due_at=${deadline.instant}, due_date=${deadline.date},
      estimated_minutes=${owns("estimatedMinutes") ? data.estimatedMinutes ?? null : row.estimated_minutes}, assignee_user_id=${assigned},
      version=version+1, updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 millisecond') WHERE id=${id} AND version=${row.version}`
    const updated = await projectTask(tx,id)
    await appendDomainEvent(tx,{workspaceId:row.workspace_id,actorUserId:actorId,type:action === "toggle" ? "task-toggled" : "task-updated",entityType:"task",entityId:id,metadata:{completed:!old.completed && updated.completed},payload:{task:updated}})
    return updated
  })
  return task
}

function validatedDeadline(input: TaskUpdate) {
  try { return taskDeadline(input) }
  catch (error) { throw new TaskError(error instanceof Error ? error.message : "Task deadline is invalid", "validation") }
}
