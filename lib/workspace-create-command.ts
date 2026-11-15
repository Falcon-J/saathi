import { z } from 'zod'
import { reviewedWorkspacePlanSchema } from './workspace-intent.ts'
import { normalizeEmail } from './identity.ts'
import { readDraft, writeDraft, removeDraft } from './draft-storage.ts'

const manual = z.strictObject({
  kind: z.literal('manual'),
  name: z.string().trim().min(1).max(100),
  summary: z.string().trim().max(240),
  targetDate: reviewedWorkspacePlanSchema.shape.targetDate,
})
export const workspaceCreationInputSchema = z.discriminatedUnion('kind', [
  manual,
  manual.extend({ kind: z.literal('plan'), summary: reviewedWorkspacePlanSchema.shape.summary, tasks: reviewedWorkspacePlanSchema.shape.tasks }),
])
export type WorkspaceCreationInput = z.infer<typeof workspaceCreationInputSchema>
const pendingSchema = z.strictObject({ actorId: z.uuid(), commandId: z.uuid(), input: workspaceCreationInputSchema })
export type PendingWorkspaceCreation = z.infer<typeof pendingSchema>

export const workspaceCreationKey = (actorId: string, account: string) =>
  'saathi:draft:' + normalizeEmail(account) + ':workspace-create:' + actorId

export function readWorkspaceCreation(key: string, actorId: string): PendingWorkspaceCreation | null {
  if (!key.endsWith(':workspace-create:' + actorId)) return null
  return readDraft(key, (value): value is PendingWorkspaceCreation => {
    const parsed = pendingSchema.safeParse(value)
    return parsed.success && parsed.data.actorId === actorId
  })
}

/** Persist and verify the exact request before any network dispatch. */
export function prepareWorkspaceCreation(key: string, actorId: string, input: WorkspaceCreationInput): PendingWorkspaceCreation {
  if (!key.endsWith(':workspace-create:' + actorId)) throw Error('The account changed. Reopen workspace creation.')
  const validated = workspaceCreationInputSchema.parse(input)
  const prior = readWorkspaceCreation(key, actorId)
  if (prior && JSON.stringify(prior.input) !== JSON.stringify(validated)) {
    throw Error('Recover the previous creation before submitting different details.')
  }
  const pending = pendingSchema.parse(prior ?? { actorId, input: validated, commandId: crypto.randomUUID() })
  writeDraft(key, pending)
  const retained = readWorkspaceCreation(key, actorId)
  if (!retained || JSON.stringify(retained) !== JSON.stringify(pending)) {
    throw Error('Browser session storage is unavailable. Enable session storage before creating a workspace so an interrupted response can be recovered.')
  }
  return retained
}

/** A late acknowledgement must not erase a newer creation. */
export function completeWorkspaceCreation(key: string, commandId: string) {
  const prior = readDraft(key, (value): value is PendingWorkspaceCreation => pendingSchema.safeParse(value).success)
  if (prior?.commandId === commandId) removeDraft(key)
}
