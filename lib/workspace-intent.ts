import { z } from "zod"

const isoDateSchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}, "Date must be a valid ISO date")

const nullableIsoDateSchema = isoDateSchema.nullable()
const executionBucketSchema = z.enum(["today", "next"])

const generatedTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bucket: executionBucketSchema,
  estimatedMinutes: z.number().int().min(1).max(1440).nullable(),
  dueDate: nullableIsoDateSchema,
}).strict()

export const workspacePlanSchema = z.object({
  title: z.string().trim().min(1).max(100),
  summary: z.string().trim().min(1).max(240),
  targetDate: nullableIsoDateSchema,
  tasks: z.array(generatedTaskSchema).min(3).max(8),
}).strict()

const commandActionSchema = z.enum([
  "complete_task",
  "add_task",
  "move_task",
  "rename_workspace",
  "unsupported",
])

export const workspaceCommandSchema = z.object({
  action: commandActionSchema,
  taskId: z.string().min(1).max(200).nullable(),
  taskTitle: z.string().trim().min(1).max(200).nullable(),
  newTitle: z.string().trim().min(1).max(100).nullable(),
  bucket: executionBucketSchema.nullable(),
  dueDate: nullableIsoDateSchema,
}).strict().superRefine((command, context) => {
  const required = (value: unknown, path: string, message: string) => {
    if (value === null) context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
  }

  if (command.action === "complete_task") required(command.taskId, "taskId", "A task ID is required")
  if (command.action === "add_task") required(command.taskTitle, "taskTitle", "A task title is required")
  if (command.action === "move_task") {
    required(command.taskId, "taskId", "A task ID is required")
    required(command.bucket, "bucket", "A destination bucket is required")
  }
  if (command.action === "rename_workspace") required(command.newTitle, "newTitle", "A workspace title is required")
})

export type WorkspacePlan = z.infer<typeof workspacePlanSchema>
export type WorkspaceCommand = z.infer<typeof workspaceCommandSchema>
export type ExecutionBucket = z.infer<typeof executionBucketSchema>

export function parseWorkspacePlan(value: unknown): WorkspacePlan {
  return workspacePlanSchema.parse(value)
}

export function parseWorkspaceCommand(value: unknown): WorkspaceCommand {
  return workspaceCommandSchema.parse(value)
}

export const workspacePlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "targetDate", "tasks"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    summary: { type: "string", minLength: 1, maxLength: 240 },
    targetDate: { type: ["string", "null"] },
    tasks: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "bucket", "estimatedMinutes", "dueDate"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          bucket: { type: "string", enum: ["today", "next"] },
          estimatedMinutes: { type: ["integer", "null"], minimum: 1, maximum: 1440 },
          dueDate: { type: ["string", "null"] },
        },
      },
    },
  },
} as const

export const workspaceCommandJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "taskId", "taskTitle", "newTitle", "bucket", "dueDate"],
  properties: {
    action: {
      type: "string",
      enum: ["complete_task", "add_task", "move_task", "rename_workspace", "unsupported"],
    },
    taskId: { type: ["string", "null"] },
    taskTitle: { type: ["string", "null"] },
    newTitle: { type: ["string", "null"] },
    bucket: { type: ["string", "null"], enum: ["today", "next", null] },
    dueDate: { type: ["string", "null"] },
  },
} as const
