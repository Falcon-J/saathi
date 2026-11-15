import { z } from "zod"
import { createWorkspaceRecord, readWorkspace, validateWorkspace } from "../../lib/data/workspaces.ts"
import type { Workspace, WorkspaceInput } from "../../lib/data/workspaces.ts"
import { getCurrentTransaction } from "../../lib/db/transaction-context.ts"
import { executeWithReceipt } from "./receipts.ts"

const inputSchema = z.strictObject({
  name: z.string(), summary: z.string().optional(), targetAt: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(), timezone: z.string().optional(),
  tasks: z.array(z.strictObject({ title: z.string().trim().min(1).max(200),
    bucket: z.enum(["today", "next"]).optional(),
    dueDate: z.string().refine(value => !Number.isNaN(Date.parse(value))).optional(),
    estimatedMinutes: z.number().int().min(1).max(1440).optional(),
  })).max(20).optional(),
})
export class BrowserWorkspaceError extends Error {
  readonly code: "invalid_input" | "forbidden" | "unavailable" | "rate_limited"
  constructor(message: string, code: BrowserWorkspaceError["code"]) { super(message); this.code = code; this.name = "BrowserWorkspaceError" }
}
const defaults = { executeWithReceipt, createWorkspaceRecord, readWorkspace }
export interface BrowserWorkspaceOptions { kind?: "manual" | "plan"; beforeCreate?: () => Promise<void> }
/** A first-party session action supplies actor identity; browser inputs cannot choose a client or delegation. */
export function createBrowserWorkspaceCreator(overrides: Partial<typeof defaults> = {}) {
  const d = { ...defaults, ...overrides }
  return async (actorId: string, input: WorkspaceInput, commandId: string, options: BrowserWorkspaceOptions = {}): Promise<Workspace> => {
    let validated: WorkspaceInput
    try {
      validated = inputSchema.parse(input)
      validateWorkspace(validated)
    } catch { throw new BrowserWorkspaceError("Review the workspace name, goal, dates, and selected tasks.", "invalid_input") }
    // Zod retains explicit undefined optional properties; JSONB and canonical receipt hashing cannot.
    const request = JSON.parse(JSON.stringify(validated)) as WorkspaceInput
    const outcome = await d.executeWithReceipt({
      actorId, clientId: "saathi-browser", commandId,
      commandType: `browser.workspaces.create.${options.kind ?? "manual"}`, input: request,
      authorize: async () => {},
      execute: async () => {
        // Admission belongs after receipt lookup: a committed reviewed plan remains recoverable when planning is disabled.
        try { await options.beforeCreate?.() }
        catch (error) {
          if (error instanceof BrowserWorkspaceError) throw error
          throw new BrowserWorkspaceError("Workspace creation is unavailable. Please try again.", "unavailable")
        }
        const workspace = await d.createWorkspaceRecord(actorId, request)
        return JSON.parse(JSON.stringify(workspace)) as Workspace
      },
      resolveWorkspaceId: workspace => workspace.id,
      projectReplay: async receipt => {
        const workspace = receipt.workspaceId ? await d.readWorkspace(receipt.workspaceId, actorId, getCurrentTransaction()) : null
        if (!workspace) throw new BrowserWorkspaceError("This workspace was previously created, but is now unavailable or access has been removed.", "forbidden")
        return workspace
      },
    })
    return outcome.result
  }
}
export const createBrowserWorkspace = createBrowserWorkspaceCreator()

export function browserWorkspaceFailure(error: unknown): { error: string; unknownOutcome: boolean } {
  if (error instanceof BrowserWorkspaceError) return { error: error.message, unknownOutcome: false }
  if (error instanceof z.ZodError) return { error: "Workspace command is invalid. Please try again.", unknownOutcome: false }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "command_conflict") {
    return { error: "This workspace command was already used for different details.", unknownOutcome: false }
  }
  return { error: "Workspace save is unconfirmed. Retry the same request to confirm its outcome.", unknownOutcome: true }
}
