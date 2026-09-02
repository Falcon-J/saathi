import type { WorkspaceCommand, WorkspacePlan } from "./workspace-intent.ts"

type CreatedWorkspace = {
  id: string
  name: string
  summary?: string
  targetDate?: string | null
}

type PlanPersistenceDependencies<TWorkspace extends CreatedWorkspace> = {
  createWorkspace: (input: {
    name: string
    summary: string
    targetDate: string | null
  }) => Promise<TWorkspace>
  addTask: (input: {
    workspaceId: string
    title: string
    dueDate?: string
    bucket: "today" | "next"
    estimatedMinutes: number | null
  }) => Promise<unknown>
  deleteWorkspace: (workspaceId: string) => Promise<void>
}

export async function persistWorkspacePlan<TWorkspace extends CreatedWorkspace>(
  plan: WorkspacePlan,
  dependencies: PlanPersistenceDependencies<TWorkspace>,
): Promise<TWorkspace> {
  const workspace = await dependencies.createWorkspace({
    name: plan.title,
    summary: plan.summary,
    targetDate: plan.targetDate,
  })

  try {
    for (const task of plan.tasks) {
      await dependencies.addTask({
        workspaceId: workspace.id,
        title: task.title,
        dueDate: task.dueDate ?? undefined,
        bucket: task.bucket,
        estimatedMinutes: task.estimatedMinutes,
      })
    }
  } catch (error) {
    try {
      await dependencies.deleteWorkspace(workspace.id)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Workspace creation failed and cleanup could not be completed.",
      )
    }
    throw error
  }

  return workspace
}

type CommandTask = {
  id: string
  title: string
  status?: "todo" | "in-progress" | "done"
  bucket?: "today" | "next"
}

type CommandDependencies = {
  updateTask: (taskId: string, updates: {
    status?: "done"
    bucket?: "today" | "next"
    dueDate?: string
  }) => Promise<unknown>
  addTask: (input: {
    workspaceId: string
    title: string
    dueDate?: string
    bucket: "today" | "next"
  }) => Promise<unknown>
  renameWorkspace: (workspaceId: string, name: string) => Promise<unknown>
}

export async function applyWorkspaceCommand(
  command: WorkspaceCommand,
  workspaceId: string,
  tasks: CommandTask[],
  dependencies: CommandDependencies,
): Promise<WorkspaceCommand["action"]> {
  const getSelectedTask = () => {
    const task = tasks.find((candidate) => candidate.id === command.taskId)
    if (!task) throw new Error("The selected task was not found in this workspace.")
    return task
  }

  switch (command.action) {
    case "complete_task": {
      const task = getSelectedTask()
      await dependencies.updateTask(task.id, { status: "done" })
      return command.action
    }
    case "add_task":
      await dependencies.addTask({
        workspaceId,
        title: command.taskTitle!,
        dueDate: command.dueDate ?? undefined,
        bucket: command.bucket ?? "today",
      })
      return command.action
    case "move_task": {
      const task = getSelectedTask()
      await dependencies.updateTask(task.id, {
        bucket: command.bucket!,
        ...(command.dueDate ? { dueDate: command.dueDate } : {}),
      })
      return command.action
    }
    case "rename_workspace":
      await dependencies.renameWorkspace(workspaceId, command.newTitle!)
      return command.action
    case "unsupported":
      throw new Error("I can't make that change yet.")
  }
}
