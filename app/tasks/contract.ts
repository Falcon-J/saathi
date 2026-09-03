import { z } from "zod"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const taskStatusSchema = z.enum(["todo", "in-progress", "done"])

const clearableText = z.string().trim().nullish().transform((value) => value || undefined)

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200).optional(),
  description: clearableText.refine(
    (value) => !value || value.length <= 1000,
    "Task description must be less than 1000 characters",
  ),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: clearableText.refine(
    (value) => !value || !Number.isNaN(Date.parse(value)),
    "Task due date is invalid",
  ),
  dueAt: clearableText.refine(
    (value) => !value || !Number.isNaN(Date.parse(value)),
    "Task due time is invalid",
  ),
  status: taskStatusSchema.optional(),
  bucket: z.enum(["today", "next"]).optional(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullish().transform((value) => value ?? undefined),
  assigneeEmail: clearableText.refine(
    (value) => !value || (value.length <= 255 && emailPattern.test(value)),
    "Task assignee is invalid",
  ).transform((value) => value?.toLowerCase()),
}).strict()

export type TaskUpdate = z.infer<typeof taskUpdateSchema>

export function normalizeTaskUpdates(updates: unknown): { updates?: TaskUpdate; error?: string } {
  const parsed = taskUpdateSchema.safeParse(updates)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Task updates are invalid" }
  }

  const normalized = parsed.data
  return Object.keys(normalized).length > 0
    ? { updates: normalized }
    : { error: "No task changes provided" }
}

export function hasTaskConflict(currentUpdatedAt: string, expectedUpdatedAt?: string): boolean {
  return expectedUpdatedAt !== undefined && currentUpdatedAt !== expectedUpdatedAt
}
