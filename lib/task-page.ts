import { z } from "zod"
import type { Task } from "./task-contract.ts"
export interface TaskPageInput { search?: string; status?: "active" | "completed" | "all"; priority?: "low" | "medium" | "high"; assigneeEmail?: string; cursor?: string; limit?: number }
export interface TaskPage { tasks: Task[]; nextCursor: string | null }
export interface TaskAggregates { total: number; open: number; done: number; overdue: number; byStatus: { todo: number; "in-progress": number; done: number }; byPriority: {low: number; medium: number; high: number} }
const schema = z.object({
  search:z.string().trim().max(200).transform(value => value.toLowerCase()).default(""),
  status:z.enum(["all","active","completed"]).default("all"),
  priority:z.enum(["low","medium","high"]).nullable().default(null),
  assigneeEmail:z.string().trim().toLowerCase().email().nullable().default(null),
  cursor:z.string().min(1).max(4096).optional(), limit:z.number().int().min(1).max(100).default(50),
}).strict()
export function normalizeTaskPage(input: unknown = {}) { return schema.parse(input) }
export type TaskPageScope = ReturnType<typeof normalizeTaskPage>
const cursorSchema = z.object({v:z.literal(1),workspace:z.string().uuid(),boundary:z.string().uuid(),order:z.literal("created-desc-id-asc"),search:z.string(),status:z.enum(["all","active","completed"]),priority:z.enum(["low","medium","high"]).nullable(),assigneeEmail:z.string().nullable()}).strict()
function scopeFields(workspace: string, scope: TaskPageScope) { return {v:1 as const,workspace,order:"created-desc-id-asc" as const,search:scope.search,status:scope.status,priority:scope.priority,assigneeEmail:scope.assigneeEmail} }
export function encodeTaskCursor(workspace: string, scope: TaskPageScope, boundary: string) { return Buffer.from(JSON.stringify({...scopeFields(workspace,scope),boundary})).toString("base64url") }
export function decodeTaskCursor(cursor: string, workspace: string, scope: TaskPageScope): string {
  if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 4096) throw new Error("Invalid task cursor")
  const decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor,"base64url").toString("utf8")))
  const {boundary,...fields} = decoded
  if (JSON.stringify(fields) !== JSON.stringify(scopeFields(workspace,scope))) throw new Error("Task cursor scope changed")
  return boundary
}
