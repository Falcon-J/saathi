export type AssistantAvailability = "available" | "not_enabled"

const supportedActionIds = [
  "plan_workspace",
  "summarize_workspace",
  "identify_attention",
  "draft_task",
] as const

const unsupportedActionIds = [
  "autonomous_mutation",
  "manage_members",
  "assign_tasks",
  "store_content",
] as const

const sharedContextIds = [
  "goal_text",
  "workspace_name",
  "workspace_summary",
  "task_id",
  "task_title",
  "task_description",
  "task_status",
  "task_priority",
  "task_due_date",
  "task_due_at",
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
