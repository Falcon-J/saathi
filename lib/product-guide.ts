export type AssistantAvailability = "available" | "not_enabled"

const supportedActionIds = [
  "plan_workspace",
  "add_task",
  "complete_task",
  "move_task",
  "rename_workspace",
] as const

const unsupportedActionIds = [
  "delete_content",
  "manage_members",
  "assign_tasks",
  "run_multiple_changes",
] as const

const sharedContextIds = [
  "goal_text",
  "workspace_id",
  "workspace_name",
  "task_id",
  "task_title",
  "task_status",
  "task_bucket",
] as const

const neverSharedIds = [
  "password",
  "session_cookie",
  "redis_credentials",
  "member_email",
] as const

export function getAssistantGuide(aiEnabled: boolean) {
  return {
    availability: (aiEnabled ? "available" : "not_enabled") as AssistantAvailability,
    supportedActionIds: [...supportedActionIds],
    unsupportedActionIds: [...unsupportedActionIds],
    sharedContextIds: [...sharedContextIds],
    neverSharedIds: [...neverSharedIds],
  }
}
