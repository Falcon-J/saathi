"use server"

import { getSession } from "@/lib/auth-simple"
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  updateWorkspaceName,
  type Workspace,
} from "@/app/actions/workspaces"
import { addTask, getTasks, updateTask } from "@/app/tasks/actions"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { requestGroqStructuredResponse } from "@/lib/groq-chat"
import {
  parseWorkspaceCommand,
  parseWorkspacePlan,
  workspaceCommandJsonSchema,
  workspacePlanJsonSchema,
} from "@/lib/workspace-intent"
import { applyWorkspaceCommand, persistWorkspacePlan } from "@/lib/workspace-intent-service"

const MAX_INTENT_LENGTH = 2000
const MAX_COMMAND_LENGTH = 500

export type WorkspaceIntentResult = {
  workspace?: Workspace
  error?: string
}

export type WorkspaceCommandResult = {
  action?: "complete_task" | "add_task" | "move_task" | "rename_workspace"
  error?: string
}

function validateText(value: string, maxLength: number, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} cannot be empty.`)
  if (trimmed.length > maxLength) throw new Error(`${label} is too long.`)
  return trimmed
}

function requireMutationSuccess(result: { error?: string }, fallback: string): void {
  if (result.error) throw new Error(result.error || fallback)
}

export async function generateWorkspaceFromIntent(intent: string): Promise<WorkspaceIntentResult> {
  try {
    const session = await getSession()
    if (!session) return { error: "Authentication required" }
    if (!isAiWorkspaceEnabled()) return { error: "AI workspace creation is disabled." }
    const normalizedIntent = validateText(intent, MAX_INTENT_LENGTH, "Goal")

    const plan = await requestGroqStructuredResponse({
      name: "saathi_workspace_plan",
      schema: workspacePlanJsonSchema,
      instructions: [
        "Turn the user's goal into one focused workspace and 3 to 8 small actionable tasks.",
        "Prioritize useful first steps. Use today for immediate work and next for later work.",
        "Keep the summary to one sentence. Use YYYY-MM-DD dates only when timing is clear.",
        `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
      ].join(" "),
      input: normalizedIntent,
      parse: parseWorkspacePlan,
    })

    const workspace = await persistWorkspacePlan(plan, {
      createWorkspace: ({ name, summary, targetDate }) => createWorkspace(name, { summary, targetDate }),
      addTask: async ({ workspaceId, title, dueDate, bucket, estimatedMinutes }) => {
        const result = await addTask(
          workspaceId,
          title,
          undefined,
          dueDate,
          undefined,
          "medium",
          bucket,
          estimatedMinutes,
        )
        requireMutationSuccess(result, "Failed to create a generated task")
        return result.task
      },
      deleteWorkspace,
    })

    return { workspace }
  } catch (error) {
    console.error("[Saathi] Workspace generation failed:", error)
    return { error: error instanceof Error ? error.message : "Unable to create this workspace. Please try again." }
  }
}

export async function applyNaturalLanguageCommand(
  workspaceId: string,
  commandText: string,
): Promise<WorkspaceCommandResult> {
  try {
    const session = await getSession()
    if (!session) return { error: "Authentication required" }
    if (!isAiWorkspaceEnabled()) return { error: "AI workspace commands are disabled." }
    const normalizedCommand = validateText(commandText, MAX_COMMAND_LENGTH, "Command")

    const taskResult = await getTasks(workspaceId)
    requireMutationSuccess(taskResult, "Unable to load workspace tasks")
    const tasks = taskResult.tasks ?? []
    const workspace = await getWorkspace(workspaceId)
    if (!workspace) return { error: "Workspace not found" }

    const command = await requestGroqStructuredResponse({
      name: "saathi_workspace_command",
      schema: workspaceCommandJsonSchema,
      instructions: [
        "Translate the request into exactly one supported mutation.",
        "Supported actions are complete_task, add_task, move_task, and rename_workspace.",
        "For existing tasks, use only a stable task ID from the supplied context.",
        "Use unsupported when the request cannot safely map to one action.",
      ].join(" "),
      input: JSON.stringify({
        workspace: { id: workspace.id, name: workspace.name },
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status ?? (task.completed ? "done" : "todo"),
          bucket: task.bucket ?? (task.completed ? null : "today"),
        })),
        command: normalizedCommand,
      }),
      parse: parseWorkspaceCommand,
    })

    const action = await applyWorkspaceCommand(command, workspaceId, tasks, {
      updateTask: async (taskId, updates) => {
        const result = await updateTask(taskId, updates)
        requireMutationSuccess(result, "Unable to update task")
        return result.task
      },
      addTask: async ({ workspaceId: selectedWorkspaceId, title, dueDate, bucket }) => {
        const result = await addTask(
          selectedWorkspaceId,
          title,
          undefined,
          dueDate,
          undefined,
          "medium",
          bucket,
        )
        requireMutationSuccess(result, "Unable to add task")
        return result.task
      },
      renameWorkspace: updateWorkspaceName,
    })

    return action === "unsupported" ? { error: "I can't make that change yet." } : { action }
  } catch (error) {
    console.error("[Saathi] Workspace command failed:", error)
    return { error: error instanceof Error ? error.message : "I can't make that change yet." }
  }
}
