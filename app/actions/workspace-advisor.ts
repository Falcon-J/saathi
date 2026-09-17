"use server"

import { getSession } from "@/lib/auth-simple"
import { isAiWorkspaceEnabled } from "@/lib/feature-flags"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { readWorkspace } from "@/lib/data/workspaces"
import { listTaskRecords } from "@/lib/data/tasks"
import { createTaskRecord } from "@/lib/data/tasks"
import { AiOperationError, recordAiOperation, type AiOperationMetadata } from "@/lib/data/ai-operations"
import { advisorTaskDraftSchema, buildAdvisorProjection, type AdvisorResponse, type AdvisorTaskDraft } from "@/lib/ai/workspace-advisor"
import { requestWorkspaceAdvisor } from "@/lib/ai/workspace-advisor-service"
import { normalizeTaskUpdates } from "@/app/tasks/contract"
import { redis } from "@/lib/redis"
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
  duplicate?: boolean
}

const idempotencyKeySchema = z.string().uuid()
const confirmationTtlSeconds = 10 * 60

type DraftConfirmationClaim = {
  status: "processing" | "complete"
  actorId: string
  workspaceId: string
  task?: Task
}

function failureOutcome(error: unknown): AiOperationMetadata["outcome"] {
  if (error instanceof RateLimitExceeded) return "rate_limited"
  if (error instanceof AiOperationError && /invalid/i.test(error.message)) return "invalid_response"
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

    const claimKey = `ai-draft-confirmation:${session.id}:${workspaceId}:${parsedKey.data}`
    let claim: DraftConfirmationClaim | null = null
    try {
      claim = await redis.get(claimKey) as DraftConfirmationClaim | null
      if (!claim) {
        const claimed = await redis.setIfAbsent(claimKey, {
          status: "processing",
          actorId: session.id,
          workspaceId,
        } satisfies DraftConfirmationClaim, { ex: confirmationTtlSeconds })
        if (!claimed) claim = await redis.get(claimKey) as DraftConfirmationClaim | null
        if (!claimed && !claim) return { error: "This task proposal is already being confirmed. Please wait and refresh." }
      }
    } catch {
      return { error: "Task confirmation is temporarily unavailable. Please try again." }
    }

    if (claim?.status === "complete" && claim.task) return { task: claim.task, duplicate: true }
    if (claim?.status === "processing") return { error: "This task proposal is already being confirmed. Please wait and refresh." }

    try {
      const task = await createTaskRecord(session.id, workspaceId, normalized.updates)
      try {
        await redis.set(claimKey, { status: "complete", actorId: session.id, workspaceId, task } satisfies DraftConfirmationClaim, { ex: confirmationTtlSeconds })
      } catch {
        console.warn("[Saathi] AI draft confirmation result could not be cached")
      }
      return { task }
    } catch {
      try { await redis.del(claimKey) } catch { /* The claim will expire if Redis is unavailable. */ }
      return { error: "The reviewed task could not be created. Please try again." }
    }
  } catch {
    return { error: "Task confirmation is temporarily unavailable. Please try again." }
  }
}
