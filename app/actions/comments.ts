"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth-simple"
import { getRateLimits } from "@/lib/env"
import { consumeDistributedRateLimit, RateLimitExceeded } from "@/lib/rate-limit"
import { createTaskComment, listTaskComments, type TaskComment } from "@/lib/data/comments"
import { TaskError } from "@/lib/data/tasks"

export type CommentMutationResult = {
  success?: true
  comment?: TaskComment
  error?: string
  code?: "rate_limited"
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
  return { error: error instanceof TaskError ? error.message : "Unable to process the comment. Please try again." }
}

export async function getTaskComments(taskId: string): Promise<{ comments?: TaskComment[]; error?: string }> {
  try {
    const session = await actor()
    return { comments: await listTaskComments(session.id, taskId) }
  } catch (error) {
    return { error: error instanceof TaskError ? error.message : "Unable to load comments. Please try again." }
  }
}

export async function addTaskComment(taskId: string, body: string): Promise<CommentMutationResult> {
  try {
    const session = await actor()
    const limits = getRateLimits().tasks
    await consumeDistributedRateLimit(`comments:${session.id}:${taskId}`, limits.maxRequests, limits.windowMs)
    const comment = await createTaskComment(session.id, taskId, body)
    revalidatePath("/dashboard")
    return { success: true, comment }
  } catch (error) {
    return failure(error)
  }
}
