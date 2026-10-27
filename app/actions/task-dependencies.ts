"use server"

import { getVerifiedActor } from "@/lib/auth-simple"
import { afterDomainCommit } from "@/lib/post-commit"
import { TaskError, type TaskErrorCode } from "@/lib/data/tasks"
import { changeTaskPrerequisite, readTaskGraph, type TaskGraph, type PrerequisiteCommand, type PrerequisiteResult } from "@/lib/data/task-dependencies"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { getRateLimits } from "@/lib/env"

type Failure = { success?: undefined; error: string; code: TaskErrorCode | "rate_limited"; retryAfterSeconds?: number; unknownOutcome?: boolean }
export type TaskGraphResult = ({ success: true } & TaskGraph) | Failure
export type PrerequisiteMutationResult = ({ success: true } & PrerequisiteResult) | Failure

export async function getTaskGraph(workspaceId: string): Promise<TaskGraphResult> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) throw new TaskError("Authentication required", "unauthenticated")
    return { success: true, ...await readTaskGraph(actor.id, workspaceId) }
  } catch (error) {
    return { error: error instanceof TaskError ? error.message : "Unable to load task prerequisites. Please retry.",
      code: error instanceof TaskError ? error.code : "unavailable" }
  }
}

async function change(input: Omit<PrerequisiteCommand, "operation">, operation: "add" | "remove"): Promise<PrerequisiteMutationResult> {
  try {
    const actor = await getVerifiedActor()
    if (!actor) throw new TaskError("Authentication required", "unauthenticated")
    const limit = getRateLimits().tasks
    await consumeDistributedRateLimit(`tasks:${actor.id}`, limit.maxRequests, limit.windowMs)
    const result = await changeTaskPrerequisite(actor.id, { ...input, operation })
    afterDomainCommit(input.workspaceId)
    return { success: true, ...result }
  } catch (error) {
    if (error instanceof RateLimitExceeded) return { error: error.message, code: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }
    if (error instanceof TaskError) return { error: error.message, code: error.code }
    return { error: "Unable to confirm the prerequisite was saved. Retry the same change to recover its result.", code: "unavailable", unknownOutcome: true }
  }
}

export async function addPrerequisite(input: Omit<PrerequisiteCommand, "operation">): Promise<PrerequisiteMutationResult> { return change(input, "add") }
export async function removePrerequisite(input: Omit<PrerequisiteCommand, "operation">): Promise<PrerequisiteMutationResult> { return change(input, "remove") }
