"use server"

import { getSession } from "@/lib/auth-simple"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { readWorkspace } from "@/lib/data/workspaces"
import { listTaskRecords } from "@/lib/data/tasks"
import { createTaskRecord } from "@/lib/data/tasks"
import { afterDomainCommit } from "@/lib/post-commit"
import { recordAiOperation, type AiOperationMetadata } from "@/lib/data/ai-operations"
import { advisorTaskDraftSchema, buildAdvisorProjection, type AdvisorResponse } from "@/lib/ai/workspace-advisor"
import { AdvisorResponseError, requestWorkspaceAdvisor } from "@/lib/ai/workspace-advisor-service"
import { normalizeTaskUpdates } from "@/app/tasks/contract"
import { z } from "zod"
import type { Task } from "@/app/tasks/actions"

export type WorkspaceAdvisorResult = {
  response?: AdvisorResponse
  error?: string
  code?: "rate_limited"
  retryAfterSeconds?: number
}

export type WorkspaceAdvisorConfirmationResult = {
  task?: Task
  error?: string
  warning?: string
}

const idempotencyKeySchema = z.string().uuid()
function failureOutcome(error: unknown): AiOperationMetadata["outcome"] {
  if (error instanceof RateLimitExceeded) return "rate_limited"
  if (error instanceof AdvisorResponseError) return "invalid_response"
  return "provider_unavailable"
}

async function recordSafely(userId: string, workspaceId: string, metadata: Omit<AiOperationMetadata, "capability"> & { capability: AdvisorResponse["capability"] }) {
  try {
    await recordAiOperation(userId, workspaceId, metadata)
  } catch {
    console.warn("[Saathi] AI operation metadata was not recorded")
  }
}

export async function askWorkspaceAdvisor(
  workspaceId: string,
  capability: AdvisorResponse["capability"],
  question: string,
): Promise<WorkspaceAdvisorResult> {
  try {
    const session = await getSession()
    if (!session) return { error: "Authentication required" }

    const workspace = await readWorkspace(workspaceId, session.id)
    if (!workspace) return { error: "Workspace unavailable or access denied" }

    const tasks = await listTaskRecords(session.id, workspaceId)
    const projection = buildAdvisorProjection({
      name: workspace.name,
      summary: workspace.summary,
      timezone: workspace.timezone,
      tasks: tasks.map(task => ({
        ...task,
        status: task.status ?? "todo",
        priority: task.priority ?? "medium",
      })),
    })

    if (!isAiWorkspaceEnabled()) {
      await recordSafely(session.id, workspaceId, {
        capability,
        outcome: "disabled",
        latencyMs: 0,
        estimatedCostMicros: 0,
      })
      return { error: "AI advice is unavailable. You can continue using the workspace manually." }
    }

    try {
      await consumeDistributedRateLimit(`ai-advisor:${session.id}:${workspaceId}`, 5, 3600000)
    } catch (error) {
      await recordSafely(session.id, workspaceId, {
        capability,
        outcome: failureOutcome(error),
        latencyMs: 0,
        estimatedCostMicros: 0,
      })
      if (error instanceof RateLimitExceeded) {
        return { error: error.message, code: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }
      }
      return { error: "AI advice is temporarily unavailable. Please try again." }
    }

    const startedAt = Date.now()
    try {
      const response = await requestWorkspaceAdvisor({ capability, question, projection })
      await recordSafely(session.id, workspaceId, {
        capability,
        outcome: "success",
        latencyMs: Date.now() - startedAt,
        estimatedCostMicros: 0,
      })
      return { response }
    } catch (error) {
      await recordSafely(session.id, workspaceId, {
        capability,
        outcome: failureOutcome(error),
        latencyMs: Date.now() - startedAt,
        estimatedCostMicros: 0,
      })
      return { error: "AI advice is temporarily unavailable. Please try again." }
    }
  } catch {
    return { error: "AI advice is temporarily unavailable. Please try again." }
  }
}

export async function confirmWorkspaceAdvisorDraft(
  workspaceId: string,
  draftInput: unknown,
  idempotencyKey: string,
): Promise<WorkspaceAdvisorConfirmationResult> {
  try {
    const session = await getSession()
    if (!session) return { error: "Authentication required" }
    if (!isAiWorkspaceEnabled()) return { error: "AI advice is unavailable. You can continue using the workspace manually." }

    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey)
    const parsedDraft = advisorTaskDraftSchema.safeParse(draftInput)
    if (!parsedKey.success || !parsedDraft.success) return { error: "This task proposal is no longer valid. Ask Saathi for a new draft." }

    const normalized = normalizeTaskUpdates({
      title: parsedDraft.data.title,
      description: parsedDraft.data.description ?? undefined,
      priority: parsedDraft.data.priority,
      dueDate: parsedDraft.data.dueDate ?? undefined,
      dueAt: parsedDraft.data.dueAt ?? undefined,
      estimatedMinutes: parsedDraft.data.estimatedMinutes ?? undefined,
    })
    if (!normalized.updates) return { error: normalized.error ?? "This task proposal is invalid." }

    const task = await createTaskRecord(session.id, workspaceId, normalized.updates, parsedKey.data)
    afterDomainCommit(workspaceId)
    return { task }
  } catch {
    return { error: "Task confirmation is temporarily unavailable. Please try again." }
  }
}
