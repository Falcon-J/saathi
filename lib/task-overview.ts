import { calendarDateKey } from "./task-time.ts"

type OverviewTask = {
  completed: boolean
  status?: "todo" | "in-progress" | "done"
  bucket?: "today" | "next"
  dueDate?: string
  dueAt?: string
}

export type TaskOverviewGroups<TTask extends OverviewTask> = {
  overdue: TTask[]
  today: TTask[]
  next: TTask[]
  completed: TTask[]
  completion: number
}

export function groupTasksForOverview<TTask extends OverviewTask>(
  tasks: TTask[],
  today = new Date().toISOString().slice(0, 10),
): TaskOverviewGroups<TTask> {
  const groups: TaskOverviewGroups<TTask> = {
    overdue: [],
    today: [],
    next: [],
    completed: [],
    completion: Math.round((tasks.filter((task) => task.completed || task.status === "done").length / Math.max(tasks.length, 1)) * 100),
  }

  for (const task of tasks) {
    if (task.completed || task.status === "done") {
      groups.completed.push(task)
      continue
    }

    // An explicit deadline is authoritative; bucket is only a fallback for older undated tasks.
    const dueDate = calendarDateKey(task.dueDate || task.dueAt)
    if (dueDate) {
      if (dueDate < today) groups.overdue.push(task)
      else if (dueDate > today) groups.next.push(task)
      else groups.today.push(task)
      continue
    }

    if (task.bucket === "next") groups.next.push(task)
    else groups.today.push(task)
  }

  return groups
}
