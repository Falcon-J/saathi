import { taskDeadline } from "../task-deadline.ts"
import { randomUUID } from "node:crypto"
import { getDb, type Transaction } from "../db/client.ts"
import { appendDomainEvent, flushOutbox } from "./events.ts"
import { normalizeTaskUpdates, type TaskUpdate } from "../../app/tasks/contract.ts"
import { canChangeTask, matchesTaskVersion } from "../task-permission.ts"
import type { Task } from "../../app/tasks/actions.ts"

export class TaskError extends Error {}
const iso = (value: Date | string) => new Date(value).toISOString()
type Db = ReturnType<typeof getDb> | Transaction

async function projectTask(db: Db, id: string): Promise<Task> {
  const [row] = await db`SELECT t.*, creator.email AS creator_email, assignee.email AS assignee_email
    FROM tasks t JOIN auth.users creator ON creator.id = t.created_by_user_id
    LEFT JOIN auth.users assignee ON assignee.id = t.assignee_user_id WHERE t.id = ${id}`
  if (!row) throw new TaskError("Task not found")
  return { id: row.id, workspaceId: row.workspace_id, title: row.title, description: row.description ?? undefined,
    status: row.status === "in_progress" ? "in-progress" : row.status, completed: row.status === "done",
    dueDate: row.due_date ? String(row.due_date).slice(0,10) : undefined, priority: row.priority, bucket: row.bucket ?? undefined, dueAt: row.due_at ? iso(row.due_at) : undefined,
    estimatedMinutes: row.estimated_minutes ?? undefined, assigneeEmail: row.assignee_email ?? undefined,
    createdBy: row.creator_email, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: row.version }
}
async function lockWorkspace(tx: Transaction, workspaceId: string, actorId: string) {
  const [workspace] = await tx`SELECT * FROM workspaces WHERE id = ${workspaceId} FOR UPDATE`
  const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${actorId}`
  if (!workspace || !member || workspace.archived_at) throw new TaskError("Workspace unavailable or access denied")
  return workspace
}
async function assigneeId(tx: Transaction, workspaceId: string, email?: string) {
  if (!email) return null
  const [member] = await tx`SELECT m.user_id FROM workspace_members m JOIN auth.users u ON u.id=m.user_id
    WHERE m.workspace_id=${workspaceId} AND lower(u.email)=${email.trim().toLowerCase()}`
  if (!member) throw new TaskError("Task assignee must be a workspace member")
  return member.user_id as string
}
export async function listTaskRecords(actorId: string, workspaceId: string): Promise<Task[]> {
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const [member] = await tx`SELECT user_id FROM workspace_members WHERE workspace_id=${workspaceId} AND user_id=${actorId}`
    if (!member) throw new TaskError("Workspace unavailable or access denied")
    const ids = await tx`SELECT id FROM tasks WHERE workspace_id=${workspaceId} ORDER BY created_at DESC`
    return Promise.all(ids.map(row => projectTask(tx, row.id)))
  })
}
export async function createTaskRecord(actorId: string, workspaceId: string, input: TaskUpdate): Promise<Task> {
  const result = normalizeTaskUpdates(input)
  if (!result.updates?.title) throw new TaskError(result.error ?? "Task title is required")
  const data = result.updates, id = randomUUID()
  const deadline = taskDeadline(data)
  const task = await getDb().begin(async tx => {
    await lockWorkspace(tx, workspaceId, actorId)
    const assignee = await assigneeId(tx, workspaceId, data.assigneeEmail)
    await tx`INSERT INTO tasks (id,workspace_id,title,description,priority,bucket,due_at,due_date,estimated_minutes,assignee_user_id,created_by_user_id)
      VALUES (${id},${workspaceId},${data.title!},${data.description ?? null},${data.priority ?? "medium"},${data.bucket ?? null},
        ${deadline.instant},${deadline.date},${data.estimatedMinutes ?? null},${assignee},${actorId})`
    const created = await projectTask(tx, id)
    await appendDomainEvent(tx, {workspaceId,actorUserId:actorId,type:"task-created",entityType:"task",entityId:id,payload:{task:created}})
    return created
  })
  await flushOutbox(workspaceId)
  return task
}
export async function changeTaskRecord(actorId: string, id: string, action: "edit" | "toggle" | "delete", input: TaskUpdate, expected?: string | number): Promise<Task> {
  const result = action === "edit" ? normalizeTaskUpdates(input) : {updates: {}}
  if (!result.updates) throw new TaskError(result.error ?? "Invalid task update")
  const normalized = result.updates
  const task = await getDb().begin(async tx => {
    const [location] = await tx`SELECT workspace_id FROM tasks WHERE id=${id}`
    if (!location) throw new TaskError("Task not found")
    const workspace = await lockWorkspace(tx, location.workspace_id, actorId)
    const [row] = await tx`SELECT * FROM tasks WHERE id=${id} FOR UPDATE`
    if (!row) throw new TaskError("Task not found")
    if (!canChangeTask({ownerId:workspace.owner_user_id,creatorId:row.created_by_user_id,assigneeId:row.assignee_user_id},actorId,action)) throw new TaskError("Access denied for this task action")
    if (!matchesTaskVersion(row.version, iso(row.updated_at), expected)) throw new TaskError("Task changed by another teammate. Refresh before saving.")
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
    const deadline = owns("dueAt") || owns("dueDate") ? taskDeadline(data) : { instant: row.due_at, date: row.due_date }
    await tx`UPDATE tasks SET title=${data.title ?? row.title}, description=${owns("description") ? data.description ?? null : row.description},
      priority=${data.priority ?? row.priority}, status=${status}, bucket=${data.bucket ?? row.bucket}, due_at=${deadline.instant}, due_date=${deadline.date},
      estimated_minutes=${owns("estimatedMinutes") ? data.estimatedMinutes ?? null : row.estimated_minutes}, assignee_user_id=${assigned},
      version=version+1, updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 millisecond') WHERE id=${id} AND version=${row.version}`
    const updated = await projectTask(tx,id)
    await appendDomainEvent(tx,{workspaceId:row.workspace_id,actorUserId:actorId,type:action === "toggle" ? "task-toggled" : "task-updated",entityType:"task",entityId:id,metadata:{completed:!old.completed && updated.completed},payload:{task:updated}})
    return updated
  })
  await flushOutbox(task.workspaceId)
  return task
}
