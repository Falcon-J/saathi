import { z } from "zod"
import { getDb } from "../db/client.ts"
import { canChangeTask } from "../task-permission.ts"
import { commandHash, readCommandReceipt, saveCommandReceipt } from "./command-receipts.ts"
import { appendDomainEvent } from "./events.ts"
import { lockWorkspace, mapTask, projectTask, TaskError } from "./tasks.ts"
import type { Task } from "../task-contract.ts"

export type TaskDependency = { workspaceId: string; dependentTaskId: string; prerequisiteTaskId: string }
export type TaskGraph = { tasks: Task[]; dependencies: TaskDependency[]; timezone: string; asOf: string }
export type PrerequisiteCommand = TaskDependency & { expectedVersion: number; commandId: string; operation: "add" | "remove" }
export type PrerequisiteResult = { task?: Task; replayed: boolean }

const commandSchema = z.object({
  workspaceId: z.string().uuid(), dependentTaskId: z.string().uuid(), prerequisiteTaskId: z.string().uuid(),
  expectedVersion: z.number().int().positive(), commandId: z.string().uuid(), operation: z.enum(["add", "remove"]),
}).strict()

export async function readTaskGraph(actorId: string, workspaceId: string): Promise<TaskGraph> {
  if (!z.string().uuid().safeParse(workspaceId).success) throw new TaskError("Invalid workspace identifier", "validation")
  return getDb().begin("isolation level repeatable read read only", async tx => {
    const [workspace] = await tx`SELECT w.timezone FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id
      WHERE w.id=${workspaceId} AND m.user_id=${actorId}`
    if (!workspace) throw new TaskError("Workspace unavailable or access denied", "forbidden")
    const [clock] = await tx`SELECT transaction_timestamp() AS as_of`
    const rows = await tx`SELECT t.*, creator.email AS creator_email, assignee.email AS assignee_email
      FROM tasks t JOIN auth.users creator ON creator.id=t.created_by_user_id
      LEFT JOIN auth.users assignee ON assignee.id=t.assignee_user_id
      WHERE t.workspace_id=${workspaceId} ORDER BY t.id`
    const edges = await tx`SELECT workspace_id, dependent_task_id, prerequisite_task_id FROM task_dependencies
      WHERE workspace_id=${workspaceId} ORDER BY dependent_task_id, prerequisite_task_id`
    return { tasks: rows.map(mapTask), dependencies: edges.map(row => ({ workspaceId: row.workspace_id,
      dependentTaskId: row.dependent_task_id, prerequisiteTaskId: row.prerequisite_task_id })),
      timezone: workspace.timezone, asOf: new Date(clock.as_of).toISOString() }
  })
}

export async function changeTaskPrerequisite(actorId: string, input: PrerequisiteCommand): Promise<PrerequisiteResult> {
  const parsed = commandSchema.safeParse(input)
  if (!parsed.success) throw new TaskError("Invalid prerequisite command", "validation")
  const command = parsed.data
  const { workspaceId, dependentTaskId, prerequisiteTaskId, expectedVersion, commandId, operation } = command
  if (dependentTaskId === prerequisiteTaskId) throw new TaskError("A task cannot depend on itself", "validation")
  const type = operation === "add" ? "dependency-add" : "dependency-remove"
  const hash = commandHash(command)
  return getDb().begin(async tx => {
    const workspace = await lockWorkspace(tx, workspaceId, actorId)
    let receipt: Task | null
    try { receipt = await readCommandReceipt<Task>(tx, workspaceId, actorId, commandId, type, hash) }
    catch (error) {
      if (error instanceof Error && error.message.includes("already used")) throw new TaskError(error.message, "conflict")
      throw error
    }
    const [dependent] = await tx`SELECT * FROM tasks WHERE workspace_id=${workspaceId} AND id=${dependentTaskId} FOR UPDATE`
    // Confirm an actor's committed command after deletion without reviving stored task content.
    if (!dependent && receipt) return { replayed: true }
    if (!dependent) throw new TaskError("Task unavailable or access denied", "forbidden")
    if (!canChangeTask({ ownerId: workspace.owner_user_id, creatorId: dependent.created_by_user_id,
      assigneeId: dependent.assignee_user_id }, actorId, "edit")) throw new TaskError("Access denied for this task action", "forbidden")
    // A replay confirms the original command, but never returns an old task version.
    if (receipt) return { task: await projectTask(tx, dependentTaskId), replayed: true }
    if (dependent.version !== expectedVersion) throw new TaskError("Task changed by another teammate. Refresh before saving.", "conflict")
    const [prerequisite] = await tx`SELECT id FROM tasks WHERE workspace_id=${workspaceId} AND id=${prerequisiteTaskId}`
    if (!prerequisite) throw new TaskError("Prerequisite unavailable or access denied", "forbidden")
    const [existing] = await tx`SELECT dependent_task_id FROM task_dependencies WHERE workspace_id=${workspaceId}
      AND dependent_task_id=${dependentTaskId} AND prerequisite_task_id=${prerequisiteTaskId}`
    if ((operation === "add") === Boolean(existing)) throw new TaskError(operation === "add" ? "This prerequisite already exists" : "This prerequisite no longer exists", "conflict")
    if (operation === "add") {
      // All task and dependency writes hold this workspace lock, serializing cycle checks.
      const [cycle] = await tx`WITH RECURSIVE ancestors(id) AS (
        SELECT ${prerequisiteTaskId}::uuid UNION
        SELECT d.prerequisite_task_id FROM task_dependencies d JOIN ancestors a ON d.dependent_task_id=a.id
          WHERE d.workspace_id=${workspaceId}
      ) SELECT id FROM ancestors WHERE id=${dependentTaskId} LIMIT 1`
      if (cycle) throw new TaskError("This prerequisite would create a dependency cycle", "validation")
      await tx`INSERT INTO task_dependencies (workspace_id,dependent_task_id,prerequisite_task_id,created_by_user_id)
        VALUES (${workspaceId},${dependentTaskId},${prerequisiteTaskId},${actorId})`
    } else {
      await tx`DELETE FROM task_dependencies WHERE workspace_id=${workspaceId} AND dependent_task_id=${dependentTaskId}
        AND prerequisite_task_id=${prerequisiteTaskId}`
    }
    await tx`UPDATE tasks SET version=version+1, updated_at=GREATEST(clock_timestamp(),updated_at + interval '1 millisecond')
      WHERE id=${dependentTaskId} AND workspace_id=${workspaceId}`
    const task = await projectTask(tx, dependentTaskId)
    await appendDomainEvent(tx, { workspaceId, actorUserId: actorId, type: "task-updated", entityType: "task", entityId: dependentTaskId,
      metadata: { action: type, prerequisiteTaskId }, payload: { task, dependencyChanged: true } })
    await saveCommandReceipt(tx, workspaceId, actorId, commandId, type, hash, task)
    return { task, replayed: false }
  })
}
