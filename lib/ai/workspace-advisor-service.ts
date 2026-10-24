import { z } from "zod"
import { requestGroqStructuredResponse } from "../groq-chat.ts"
import { calendarDateAt, todayCalendarDate } from "../task-time.ts"
import { taskDeadline } from "../task-deadline.ts"
import {
  advisorCapabilitySchema,
  advisorTaskDraftSchema,
  buildAdvisorProjection,
  parseAdvisorResponse,
  type AdvisorProjection,
  type AdvisorResponse,
  type AdvisorWorkspace,
} from "./workspace-advisor.ts"

export class AdvisorResponseError extends Error {}

const attentionReasonSchema = z.enum(["overdue", "no_deadline", "high_priority", "in_progress", "due_today", "upcoming"])
const providerResponseSchema = z.object({
  capability: advisorCapabilitySchema,
  answer: z.string().trim().min(1).max(2000),
  attention: z.array(z.object({ taskId: z.string().trim().min(1), reasonCode: attentionReasonSchema }).strict()).max(8),
  draft: advisorTaskDraftSchema.nullable(),
}).strict()
type ProviderResponse = z.infer<typeof providerResponseSchema>

type AdvisorProviderRequest = (options: {
  name: string
  schema: object
  instructions: string
  input: string
  parse: (value: unknown) => ProviderResponse
}) => Promise<ProviderResponse>

const requestInputSchema = z.object({
  capability: advisorCapabilitySchema,
  question: z.string().trim().min(1).max(2000),
}).strict()

export const advisorResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["capability", "answer", "attention", "draft"],
  properties: {
    capability: {
      type: "string",
      enum: ["summarize_workspace", "identify_attention", "draft_task"],
    },
    answer: { type: "string", minLength: 1, maxLength: 2000 },
    attention: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["taskId", "reasonCode"],
        properties: {
          taskId: { type: "string", minLength: 1 },
          reasonCode: { type: "string", enum: attentionReasonSchema.options },
        },
      },
    },
    draft: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "description", "priority", "dueDate", "dueAt", "estimatedMinutes"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: ["string", "null"], maxLength: 1000 },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            dueDate: { type: ["string", "null"] },
            dueAt: { type: ["string", "null"] },
            estimatedMinutes: { type: ["integer", "null"], minimum: 1, maximum: 1440 },
          },
        },
      ],
    },
  },
} as const

const instructionsFor = (capability: AdvisorResponse["capability"]) => [
  "Return only JSON matching the provided schema.",
  "Give advice grounded only in the supplied workspace projection.",
  "Use the server-supplied currentTime and currentDate in the workspace timezone when describing deadlines or interpreting relative dates.",
  "Compare date-only deadlines with currentDate and precise dueAt deadlines with currentTime. An unfinished task with a past deadline is overdue, never upcoming or imminent. Completed tasks are not overdue. Undated tasks have no deadline.",
  "The supplied deadlineFacts and counts are authoritative. A workspace goal or summary never supplies a missing task deadline. Select attention reasonCode only when that task's supplied facts support it; never select a completed task.",
  "Do not make changes, invoke tools, or claim that anything was saved.",
  `Use the ${capability} capability.`,
].join(" ")

export async function requestWorkspaceAdvisor({
  capability,
  question,
  projection,
  request = requestGroqStructuredResponse,
}: {
  capability: AdvisorResponse["capability"]
  question: string
  projection: AdvisorProjection | AdvisorWorkspace
  request?: AdvisorProviderRequest
}): Promise<AdvisorResponse> {
  const input = requestInputSchema.safeParse({ capability, question })
  if (!input.success) throw new Error("Advisor question is invalid")

  const authorizedProjection = "tasks" in projection && "workspace" in projection
    ? projection
    : buildAdvisorProjection(projection)

  const now = new Date()
  const timezone = authorizedProjection.workspace.timezone
  const currentDate = todayCalendarDate(timezone, now)
  const deadlineFacts = authorizedProjection.tasks.map(task => {
    const deadline = taskDeadline(task)
    let deadlineState: "completed" | "undated" | "overdue" | "due_today" | "upcoming"
    if (task.status === "done") deadlineState = "completed"
    else if (deadline.instant) {
      deadlineState = Date.parse(deadline.instant) < now.getTime() ? "overdue"
        : calendarDateAt(deadline.instant, timezone) === currentDate ? "due_today" : "upcoming"
    } else if (deadline.date) {
      deadlineState = deadline.date < currentDate ? "overdue" : deadline.date === currentDate ? "due_today" : "upcoming"
    } else deadlineState = "undated"
    return { taskId: task.id, deadlineState }
  })
  const countState = (state: typeof deadlineFacts[number]["deadlineState"]) => deadlineFacts.filter(task => task.deadlineState === state).length
  const counts = {
    total: deadlineFacts.length,
    completed: countState("completed"),
    open: deadlineFacts.length - countState("completed"),
    overdue: countState("overdue"),
    noDeadline: countState("undated"),
    dueToday: countState("due_today"),
    upcoming: countState("upcoming"),
  }
  const response = await request({
    name: "saathi_workspace_advisor",
    schema: advisorResponseJsonSchema,
    instructions: instructionsFor(input.data.capability),
    input: JSON.stringify({
      question: input.data.question,
      currentTime: now.toISOString(),
      currentDate,
      workspace: authorizedProjection,
      deadlineFacts,
      counts,
    }),
    parse: value => {
      const parsed = providerResponseSchema.safeParse(value)
      if (!parsed.success) throw new Error("AI advisor response is invalid")
      // Preserve the public capability/draft contract at the provider boundary.
      parseAdvisorResponse({ ...parsed.data, attention: parsed.data.attention.map(item => ({ taskId: item.taskId, reason: item.reasonCode })) })
      return parsed.data
    },
  })

  if (response.capability !== input.data.capability) {
    throw new AdvisorResponseError("AI advisor response capability is invalid")
  }

  const taskFacts = new Map(authorizedProjection.tasks.map((task, index) => [task.id, { ...task, deadlineState: deadlineFacts[index].deadlineState }]))
  const referencedTaskIds = new Set<string>()
  const attention = response.attention.map(item => {
    const task = taskFacts.get(item.taskId)
    if (!task || referencedTaskIds.has(item.taskId)) {
      throw new AdvisorResponseError("AI advisor response task reference is invalid")
    }
    referencedTaskIds.add(item.taskId)
    const supported = task.status !== "done" && (
      item.reasonCode === "high_priority" ? task.priority === "high"
        : item.reasonCode === "in_progress" ? task.status === "in-progress"
          : item.reasonCode === "no_deadline" ? task.deadlineState === "undated"
            : task.deadlineState === item.reasonCode
    )
    if (!supported) throw new AdvisorResponseError("AI advisor response attention reason is invalid")
    const reasons: Record<z.infer<typeof attentionReasonSchema>, string> = {
      overdue: "Past its deadline", no_deadline: "No deadline", high_priority: "High priority",
      in_progress: "Work in progress", due_today: "Due today", upcoming: "Upcoming deadline",
    }
    return { taskId: item.taskId, reason: reasons[item.reasonCode] }
  })

  return parseAdvisorResponse({
    ...response,
    answer: input.data.capability === "summarize_workspace"
      ? `${counts.total} ${counts.total === 1 ? "task" : "tasks"}: ${counts.completed} completed, ${counts.open} open. ${counts.overdue} overdue, ${counts.noDeadline} without deadlines, ${counts.dueToday} due today, ${counts.upcoming} upcoming.`
      : response.answer,
    attention,
  })
}
