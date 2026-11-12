import { z } from "zod";
const id = z.uuid(), instant = z.iso.datetime({ offset: true }), version = z.number().int().positive();
const publicText = (max: number) => z.string().trim().min(1).max(max).refine(value => !/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-proj-|sk_live_|ghp_)[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9_.-]{20,})/i.test(value), 'Credentials must not be submitted');
export const fencingTokenSchema = z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"));
export const runStateSchema = z.enum(['queued', 'running', 'awaiting_review', 'succeeded', 'failed', 'cancelled']);
export const evidenceSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('text'), text: publicText(4000) }),
    z.strictObject({ kind: z.literal('uri'), uri: z.url().max(2048).refine(value => { try {
            const url = new URL(value);
            return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && ![...url.searchParams.keys()].some(key => /^(?:access_token|api_key|token|password|secret|authorization|credential|code)$/i.test(key));
        }
        catch {
            return false;
        } }, 'Only HTTP(S) evidence URLs are accepted'), label: publicText(200).optional() }),
]);
export const runRecordSchema = z.strictObject({ id, workspaceId: id, taskId: id, actorUserId: id, clientId: z.string().min(1).max(200), grantId: id, state: runStateSchema, fencingToken: fencingTokenSchema, leaseExpiresAt: instant, progress: publicText(2000).nullable(), evidence: z.array(evidenceSchema).max(10), reviewerUserId: id.nullable(), reviewComment: publicText(2000).nullable(), createdAt: instant, updatedAt: instant, version });
const scope = { workspaceId: id, runId: id };
const command = { commandId: id, expectedVersion: z.null() };
const held = { ...command, ...scope, fencingToken: fencingTokenSchema };
const page = { cursor: id.optional(), limit: z.number().int().min(1).max(100).default(50) };
const query = <I extends z.ZodType, O extends z.ZodType>(input: I, data: O) => ({ input, data, kind: "read" as const });
const write = <I extends z.ZodType>(input: I) => ({ input, data: runRecordSchema, kind: "mutate" as const });
export const coordinationToolSchemas = {
    'agent_runs.list': query(z.strictObject({ workspaceId: id, ...page, taskId: id.optional(), state: runStateSchema.optional() }), z.strictObject({ items: z.array(runRecordSchema), nextCursor: id.nullable() })),
    'agent_runs.get': query(z.strictObject(scope), runRecordSchema),
    'agent_runs.claim': write(z.strictObject({ commandId: id, expectedVersion: version, workspaceId: id, taskId: id, leaseSeconds: z.number().int().min(15).max(3600) })),
    'agent_runs.start': write(z.strictObject(held)),
    'agent_runs.heartbeat': write(z.strictObject({ ...held, leaseSeconds: z.number().int().min(15).max(3600) })),
    'agent_runs.report': write(z.strictObject({ ...held, progress: publicText(2000) })),
    'agent_runs.submit_review': write(z.strictObject({ ...held, evidence: z.array(evidenceSchema).min(1).max(10) })),
    'agent_runs.cancel': write(z.strictObject({ ...command, ...scope, reason: publicText(2000).optional() })),
    'agent_runs.release': write(z.strictObject({ ...held, reason: publicText(2000).optional() })),
} as const;
export const humanReviewInputSchema = z.strictObject({ commandId: id, workspaceId: id, runId: id, decision: z.enum(['approve', 'reject']), expectedTaskVersion: version, comment: publicText(2000).optional() });
export type CoordinationToolName = keyof typeof coordinationToolSchemas;
export type CoordinationRun = z.infer<typeof runRecordSchema>;
export type CoordinationEvidence = z.infer<typeof evidenceSchema>;
export type HumanReviewInput = z.infer<typeof humanReviewInputSchema>;

export function coordinationScopeFor(name: CoordinationToolName): "agent_runs:read" | "agent_runs:write" | "agent_runs:cancel" | "agent_runs:release" {
    if (name === "agent_runs.list" || name === "agent_runs.get") return "agent_runs:read";
    if (name === "agent_runs.cancel") return "agent_runs:cancel";
    if (name === "agent_runs.release") return "agent_runs:release";
    return "agent_runs:write";
}
