import { z } from "zod"

export const advisorCapabilitySchema = z.enum([
  "summarize_workspace",
  "identify_attention",
  "draft_task",
])

const taskDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().nullable(),
  dueAt: z.string().nullable(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
}).strict().superRefine((value, context) => {
  if (value.dueDate && value.dueAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Use either a due date or due time", path: ["dueDate"] })
  }
})

const advisorAttentionSchema = z.object({
  taskId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(300),
}).strict()

export const advisorResponseSchema = z.object({
  capability: advisorCapabilitySchema,
  answer: z.string().trim().min(1).max(2000),
  attention: z.array(advisorAttentionSchema).max(8),
  draft: taskDraftSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.capability === "draft_task" && !value.draft) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Draft task response must include a draft", path: ["draft"] })
  }
  if (value.capability !== "draft_task" && value.draft) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Only draft task responses may include a draft", path: ["draft"] })
  }
})

export type AdvisorResponse = z.infer<typeof advisorResponseSchema>

export type AdvisorWorkspace = {
  name: string
  summary?: string | null
  tasks: Array<{
    id: string
    title: string
    description?: string | null
    status: "todo" | "in-progress" | "done"
    priority: "low" | "medium" | "high"
    dueDate?: string | null
    dueAt?: string | null
    assigneeEmail?: string | null
    createdBy?: string
    version?: number
  }>
}

export type AdvisorProjection = {
  workspace: { name: string; summary?: string }
  tasks: Array<{
    id: string
    title: string
    description?: string
    status: AdvisorWorkspace["tasks"][number]["status"]
    priority: AdvisorWorkspace["tasks"][number]["priority"]
    dueDate: string | null
    dueAt: string | null
    assigneeEmail: string | null
  }>
}

export function parseAdvisorResponse(input: unknown): AdvisorResponse {
  const result = advisorResponseSchema.safeParse(input)
  if (!result.success) throw new Error("AI advisor response is invalid")
  return result.data
}

export function buildAdvisorProjection(workspace: AdvisorWorkspace): AdvisorProjection {
  return {
    workspace: {
      name: workspace.name,
      ...(workspace.summary ? { summary: workspace.summary } : {}),
    },
    tasks: workspace.tasks.map(task => ({
      id: task.id,
      title: task.title,
      ...(task.description ? { description: task.description } : {}),
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? null,
      dueAt: task.dueAt ?? null,
      assigneeEmail: task.assigneeEmail ?? null,
    })),
  }
}
