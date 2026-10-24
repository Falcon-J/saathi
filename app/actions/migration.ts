"use server"

import { createHash } from "node:crypto"
import { getSession } from "@/lib/auth-simple"
import { parseCsv } from "@/lib/csv"
import { addTask } from "@/app/tasks/actions"
import { getUserWorkspaces } from "./workspaces"
import { resolveFeatureFlags } from "@/lib/feature-flags"

const MAX_CSV_BYTES = 512 * 1024
const MAX_ROWS = 100
const priorities = new Set(["low", "medium", "high"])

export interface CsvImportResult {
  imported: number
  failed: number
  errors: Array<{ row: number; message: string }>
}

export async function importTasksFromCsv(workspaceId: string, csvText: string): Promise<CsvImportResult | { error: string }> {
  const session = await getSession()
  if (!session) {
    return { error: "Authentication required" }
  }
  if (!resolveFeatureFlags(process.env).csvImport) {
    return { error: "CSV import is unavailable. You can create tasks manually." }
  }

  if (typeof csvText !== "string" || new TextEncoder().encode(csvText).byteLength > MAX_CSV_BYTES) {
    return { error: "CSV file must be smaller than 512 KB" }
  }

  let workspaces
  try {
    workspaces = await getUserWorkspaces(session.email)
  } catch (error) {
    console.error("[Migration] Failed to load workspaces:", error)
    return { error: "Unable to access this workspace. Please try again." }
  }
  if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
    return { error: "Access denied: Not a member of this workspace" }
  }

  let rows: Record<string, string>[]
  try {
    rows = parseCsv(csvText)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "CSV file is invalid" }
  }

  if (rows.length === 0 || !Object.prototype.hasOwnProperty.call(rows[0], "title")) {
    return { error: "CSV must include a title column and at least one task" }
  }
  if (rows.length > MAX_ROWS) {
    return { error: `CSV can contain at most ${MAX_ROWS} tasks` }
  }

  // Stable per-file and row IDs permit retrying partial imports without duplicating
  // committed rows. Row index keeps identical rows within one file distinct.
  const fileHash = createHash("sha256").update(csvText).digest("hex")
  const result: CsvImportResult = { imported: 0, failed: 0, errors: [] }

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    const title = row.title
    if (!title) {
      result.failed += 1
      result.errors.push({ row: rowNumber, message: "Task title is required" })
      continue
    }

    const priority = row.priority?.toLowerCase()
    if (priority && !priorities.has(priority)) {
      result.failed += 1
      result.errors.push({ row: rowNumber, message: "Priority must be low, medium, or high" })
      continue
    }

    const estimatedMinutes = row.estimatedminutes ? Number(row.estimatedminutes) : undefined
    if (row.estimatedminutes) {
      if (estimatedMinutes === undefined || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440) {
        result.failed += 1
        result.errors.push({ row: rowNumber, message: "Estimate must be a whole number between 1 and 1440 minutes" })
        continue
      }
    }

    const digest = createHash("sha256").update(JSON.stringify([session.id, workspaceId, fileHash, index])).digest("hex")
    const commandId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`
    try {
      const taskResult = await addTask(
        workspaceId,
        title,
        row.description || undefined,
        row.duedate || undefined,
        row.assigneeemail || undefined,
        (priority || "medium") as "low" | "medium" | "high",
        undefined,
        estimatedMinutes,
        row.dueat || undefined,
        commandId,
      )

      if (taskResult.error) {
        result.failed += 1
        result.errors.push({ row: rowNumber, message: taskResult.error })
      } else {
        result.imported += 1
      }
    } catch {
      result.failed += 1
      result.errors.push({
        row: rowNumber,
        message: "Task could not be imported. Refresh the Board before retrying this row.",
      })
    }
  }

  return result
}
