type OverviewTask = {
  completed: boolean
  status?: "todo" | "in-progress" | "done"
  bucket?: "today" | "next"
  dueDate?: string
}

export type TaskOverviewGroups<TTask extends OverviewTask> = {
  today: TTask[]
  next: TTask[]
  completed: TTask[]
  completion: number
}

function dueDateKey(value?: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

export function groupTasksForOverview<TTask extends OverviewTask>(
  tasks: TTask[],
  today = new Date().toISOString().slice(0, 10),
): TaskOverviewGroups<TTask> {
  const groups: TaskOverviewGroups<TTask> = {
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

    if (task.bucket === "next") {
      groups.next.push(task)
      continue
    }
    if (task.bucket === "today") {
      groups.today.push(task)
      continue
    }

    const dueDate = dueDateKey(task.dueDate)
    if (dueDate && dueDate > today) groups.next.push(task)
    else groups.today.push(task)
  }

  return groups
}
