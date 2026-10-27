import type { Task, TaskStatus } from "./task-contract.ts"
import { calendarDateAt, calendarDateKey, todayCalendarDate } from "./task-time.ts"

export type NextWorkTask = Pick<Task, "id" | "workspaceId" | "title" | "status" | "completed" | "dueDate" | "dueAt" | "assigneeEmail">
export type TaskDependency = { workspaceId: string; dependentTaskId: string; prerequisiteTaskId: string }
export type NextWorkDependency = TaskDependency
export type NextWorkItem<T extends NextWorkTask = NextWorkTask> = {
  task: T
  readiness: "ready" | "waiting" | "completed_inconsistent"
  prerequisites: Array<{ taskId: string; title: string; status: TaskStatus }>
  unassigned: boolean
}
export type NextWorkResult<T extends NextWorkTask = NextWorkTask> = {
  asOf: string
  ready: NextWorkItem<T>[]
  waiting: NextWorkItem<T>[]
  completedInconsistencies: NextWorkItem<T>[]
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const statusOf = (task: NextWorkTask): TaskStatus => task.completed || task.status === "done" ? "done" : task.status ?? "todo"

// Callers must supply the complete authorized workspace graph from one consistent read.
export function deriveNextWork<T extends NextWorkTask>(
  tasks: readonly T[], dependencies: readonly TaskDependency[], timezone = "UTC", now = new Date(),
): NextWorkResult<T> {
  todayCalendarDate(timezone, now)
  const result: NextWorkResult<T> = { asOf: now.toISOString(), ready: [], waiting: [], completedInconsistencies: [] }
  const byId = new Map(tasks.map(task => [task.id, task]))
  const workspaceId = tasks[0]?.workspaceId
  if (byId.size !== tasks.length || tasks.some(task => task.workspaceId !== workspaceId)) {
    throw new Error("Next work graph contains duplicate or cross-workspace tasks")
  }
  const prerequisites = new Map(tasks.map(task => [task.id, [] as T[]]))
  const dependents = new Map(tasks.map(task => [task.id, [] as string[]]))
  const indegree = new Map(tasks.map(task => [task.id, 0]))
  const edgeIds = new Set<string>()
  for (const edge of dependencies) {
    const dependent = byId.get(edge.dependentTaskId)
    const prerequisite = byId.get(edge.prerequisiteTaskId)
    const key = `${edge.dependentTaskId}\0${edge.prerequisiteTaskId}`
    if (!dependent || !prerequisite || edge.workspaceId !== workspaceId) throw new Error("Next work graph is incomplete or crosses workspaces")
    if (dependent.id === prerequisite.id || edgeIds.has(key)) throw new Error("Next work graph contains a self-link or duplicate dependency")
    edgeIds.add(key)
    prerequisites.get(dependent.id)!.push(prerequisite)
    dependents.get(prerequisite.id)!.push(dependent.id)
    indegree.set(dependent.id, indegree.get(dependent.id)! + 1)
  }
  const queue = tasks.filter(task => indegree.get(task.id) === 0).map(task => task.id)
  for (let index = 0; index < queue.length; index++) {
    for (const id of dependents.get(queue[index])!) {
      indegree.set(id, indegree.get(id)! - 1)
      if (indegree.get(id) === 0) queue.push(id)
    }
  }
  if (queue.length !== tasks.length) throw new Error("Next work graph contains a dependency cycle")

  const deadlines = new Map<string, { date: string; instant: number }>()
  for (const task of tasks) {
    if (task.dueAt && task.dueDate) throw new Error("Next work task deadline is invalid")
    const date = task.dueAt ? calendarDateAt(task.dueAt, timezone) : task.dueDate ? calendarDateKey(task.dueDate) : ""
    if ((task.dueAt && !date) || (task.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || !date))) {
      throw new Error("Next work task deadline is invalid")
    }
    deadlines.set(task.id, { date: date ?? "", instant: task.dueAt ? Date.parse(task.dueAt) : Infinity })
    const sources = prerequisites.get(task.id)!.sort((a, b) => compareText(a.id, b.id))
    const waiting = sources.some(source => statusOf(source) !== "done")
    const completed = statusOf(task) === "done"
    if (completed && !waiting) continue
    const item: NextWorkItem<T> = {
      task,
      readiness: completed ? "completed_inconsistent" : waiting ? "waiting" : "ready",
      prerequisites: sources.map(source => ({ taskId: source.id, title: source.title, status: statusOf(source) })),
      unassigned: !task.assigneeEmail,
    }
    if (completed) result.completedInconsistencies.push(item)
    else if (waiting) result.waiting.push(item)
    else result.ready.push(item)
  }
  const compare = (a: NextWorkItem<T>, b: NextWorkItem<T>) => {
    const left = deadlines.get(a.task.id)!, right = deadlines.get(b.task.id)!
    if (!left.date || !right.date) return Number(!left.date) - Number(!right.date) || compareText(a.task.id, b.task.id)
    return compareText(left.date, right.date)
      || (left.instant < right.instant ? -1 : left.instant > right.instant ? 1 : 0)
      || compareText(a.task.id, b.task.id)
  }
  result.ready.sort(compare)
  result.waiting.sort(compare)
  result.completedInconsistencies.sort(compare)
  return result
}
