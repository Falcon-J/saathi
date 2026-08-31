"use server"

import { getSession } from "@/lib/auth-simple"
import { parseCsv } from "@/lib/csv"
import { addTask } from "@/app/tasks/actions"
import { getUserWorkspaces } from "./workspaces"

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

  if (typeof csvText !== "string" || new TextEncoder().encode(csvText).byteLength > MAX_CSV_BYTES) {
    return { error: "CSV file must be smaller than 512 KB" }
  }

  const workspaces = await getUserWorkspaces(session.email)
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

  const result: CsvImportResult = { imported: 0, failed: 0, errors: [] }

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2
    const title = row.title
    if (!title) {
      result.failed += 1
      result.errors.push({ row: rowNumber, message: "Task title is required" })
      continue
    }

    if (row.priority && !priorities.has(row.priority)) {
      result.failed += 1
      result.errors.push({ row: rowNumber, message: "Priority must be low, medium, or high" })
      continue
    }

    try {
      const taskResult = await addTask(
        workspaceId,
        title,
        row.description || undefined,
        row.duedate || undefined,
        row.assigneeemail || undefined,
        (row.priority || "medium") as "low" | "medium" | "high",
      )

      if (taskResult.error) {
        result.failed += 1
        result.errors.push({ row: rowNumber, message: taskResult.error })
      } else {
        result.imported += 1
      }
    } catch (error) {
      result.failed += 1
      result.errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : "Task could not be imported",
      })
    }
  }

  return result
}
