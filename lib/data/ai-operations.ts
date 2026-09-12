import { randomUUID } from "node:crypto"
import { z } from "zod"
import { getDb } from "../db/client.ts"
import { advisorCapabilitySchema } from "../ai/workspace-advisor.ts"

export const aiOperationOutcomeSchema = z.enum([
  "success",
  "provider_unavailable",
  "rate_limited",
  "invalid_response",
  "disabled",
  "unauthorized",
])

const aiOperationMetadataSchema = z.object({
  capability: advisorCapabilitySchema,
  outcome: aiOperationOutcomeSchema,
  latencyMs: z.number().int().min(0).max(300000),
  estimatedCostMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict()

export type AiOperationMetadata = z.infer<typeof aiOperationMetadataSchema>

export class AiOperationError extends Error {}

export function validateAiOperationMetadata(input: unknown): AiOperationMetadata {
  const result = aiOperationMetadataSchema.safeParse(input)
  if (!result.success) throw new AiOperationError("AI operation metadata is invalid")
  return result.data
}

export async function recordAiOperation(
  requestingUserId: string,
  workspaceId: string,
  input: unknown,
): Promise<void> {
  const metadata = validateAiOperationMetadata(input)
  await getDb().begin(async tx => {
    const [member] = await tx`SELECT w.id FROM workspaces w
      JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ${requestingUserId}
      WHERE w.id = ${workspaceId} AND w.archived_at IS NULL`
    if (!member) throw new AiOperationError("Workspace unavailable or access denied")
    await tx`INSERT INTO ai_operation_logs
      (id, workspace_id, requesting_user_id, capability, outcome, latency_ms, estimated_cost_micros)
      VALUES (${randomUUID()}, ${workspaceId}, ${requestingUserId}, ${metadata.capability}, ${metadata.outcome},
        ${metadata.latencyMs}, ${metadata.estimatedCostMicros})`
  })
}

export async function deleteExpiredAiOperations(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const rows = await getDb()`DELETE FROM ai_operation_logs WHERE created_at < ${cutoff} RETURNING id`
  return rows.length
}
