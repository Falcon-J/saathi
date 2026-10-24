"use server"

import { afterDomainCommit } from "@/lib/post-commit"
import { getSession } from "@/lib/auth-simple"
import { getRateLimits } from "@/lib/env"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { createTaskComment, listTaskCommentsPage, type TaskComment } from "@/lib/data/comments"
import { TaskError } from "@/lib/data/tasks"

export type CommentMutationResult = {
  success?: true
  comment?: TaskComment
  error?: string
  code?: "rate_limited"
  unknownOutcome?: boolean
  retryAfterSeconds?: number
}

async function actor() {
  const session = await getSession()
  if (!session) throw new TaskError("Authentication required")
  return session
}

function failure(error: unknown): CommentMutationResult {
  if (error instanceof RateLimitExceeded) {
    return { error: error.message, code: "rate_limited", retryAfterSeconds: error.retryAfterSeconds }
  }
  if (error instanceof TaskError && error.code !== "unavailable") return { error: error.message }
  return { error: "Unable to confirm the comment was saved. Refresh before retrying.", unknownOutcome: true }
}

export async function getTaskComments(taskId: string, cursor?: string): Promise<{ comments?: TaskComment[]; nextCursor?: string | null; error?: string }> {
  try {
    const session = await actor()
    return await listTaskCommentsPage(session.id, taskId, cursor)
  } catch (error) {
    return { error: error instanceof TaskError ? error.message : "Unable to load comments. Please try again." }
  }
}

export async function addTaskComment(taskId: string, body: string, commandId?: string): Promise<CommentMutationResult> {
  try {
    const session = await actor()
    const limits = getRateLimits().tasks
    await consumeDistributedRateLimit(`comments:${session.id}:${taskId}`, limits.maxRequests, limits.windowMs)
    const comment = await createTaskComment(session.id, taskId, body, commandId)
    afterDomainCommit(comment.workspaceId)
    return { success: true, comment }
  } catch (error) {
    return failure(error)
  }
}
