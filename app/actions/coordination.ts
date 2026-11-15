'use server'

import { headers } from 'next/headers'
import { getSession } from '@/lib/auth-simple'
import { afterDomainCommit } from '@/lib/post-commit'
import { coordinationToolSchemas, humanReviewInputSchema } from '@/features/coordination/contracts'
import type { CoordinationRun, HumanReviewInput } from '@/features/coordination/contracts'
import { listCoordinationRunsForHuman, reviewCoordinationRun } from '@/features/coordination/handlers'

export type AgentActivityRun = CoordinationRun & { task: { id: string; title: string; version: number; canReview: boolean } }
export type AgentActivityResult = { runs?: AgentActivityRun[]; nextCursor?: string | null; error?: string }
export type AgentReviewResult = { success?: true; run?: CoordinationRun; error?: string; code?: string; unknownOutcome?: boolean }

const reviewMessages: Record<string, string> = {
  version_conflict: 'The task changed. Refresh agent activity before reviewing again.',
  forbidden: 'You no longer have permission to review this run.',
  not_found: 'This run is unavailable. Refresh agent activity.',
  invalid_state: 'This run is no longer awaiting review. Refresh agent activity.',
  invalid_input: 'Review details are invalid. Refresh agent activity.',
  lease_expired: 'The run lease expired. Refresh agent activity.',
  stale_fence: 'Another run took over this task. Refresh agent activity.',
  lease_conflict: 'Another run holds this task. Refresh agent activity.',
  command_conflict: 'This review identifier was already used. Refresh agent activity.',
}

export async function getAgentActivity(workspaceId: string, cursor?: string): Promise<AgentActivityResult> {
  try {
    const session = await getSession()
    if (!session) return { error: 'Sign in to view agent activity.' }
    const input = coordinationToolSchemas['agent_runs.list'].input.parse({ workspaceId, ...(cursor ? { cursor } : {}), limit: 50 })
    const page = await listCoordinationRunsForHuman({ userId: session.id, input })
    return { runs: page.items, nextCursor: page.nextCursor }
  } catch { return { error: 'Unable to load agent activity. Refresh to try again.' } }
}

/** Interactive cookie-session boundary; this operation is never registered as an MCP tool. */
export async function reviewAgentRun(rawInput: HumanReviewInput): Promise<AgentReviewResult> {
  try {
    const requestHeaders = await headers()
    if (requestHeaders.get('authorization')) return { error: 'Use your signed-in account to review this run.', code: 'forbidden' }
    const origin = requestHeaders.get('origin')
    if (!origin || !process.env.NEXT_PUBLIC_APP_URL || new URL(origin).origin !== new URL(process.env.NEXT_PUBLIC_APP_URL).origin) return { error: 'Review must be submitted from Saathi.', code: 'forbidden' }
    const session = await getSession()
    if (!session) return { error: 'Sign in to review this run.', code: 'unauthenticated' }
    const parsed = humanReviewInputSchema.safeParse(rawInput)
    if (!parsed.success) return { error: reviewMessages.invalid_input, code: 'invalid_input' }
    // The service rechecks current section edit, task permissions, version and lease under lock.
    const outcome = await reviewCoordinationRun({ reviewerUserId: session.id, input: parsed.data })
    // A replay may recover a lost response before the original publication was scheduled.
    try { afterDomainCommit(parsed.data.workspaceId) }
    catch { console.warn('[Saathi] Agent review delivery deferred after commit') }
    return { success: true, run: outcome.result }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code && Object.hasOwn(reviewMessages, code)) return { error: reviewMessages[code], code }
    return { error: 'Could not confirm the review was saved. Refresh before retrying the same review.', unknownOutcome: true }
  }
}
