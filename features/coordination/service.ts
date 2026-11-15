import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canChangeTask } from '../../lib/task-permission.ts';
import { coordinationToolSchemas, humanReviewInputSchema, runRecordSchema, coordinationScopeFor } from './contracts.ts';
import type { CoordinationRun, CoordinationToolName, HumanReviewInput } from './contracts.ts';
import type { HandlerContext, PlatformPrincipal } from '../platform/executor.ts';
export interface CoordinationTask {
    id: string;
    workspaceId: string;
    version: number;
    status: string;
    ownerId: string;
    creatorId: string;
    assigneeId: string | null;
}
export interface TaskLease {
    workspaceId: string;
    taskId: string;
    holderRunId: string | null;
    fencingToken: string;
    leaseExpiresAt: string | null;
}
export interface CoordinationSession {
    now(): Promise<Date>;
    authorize(principal: PlatformPrincipal, workspaceId: string, scope: string, capability: "read" | "edit" | "comment"): Promise<void>;
    authorizeHuman(userId: string, workspaceId: string, capability?: "read" | "edit"): Promise<void>;
    authorizeOrigin(run: CoordinationRun): Promise<void>;
    task(workspaceId: string, taskId: string): Promise<CoordinationTask>;
    run(runId: string): Promise<CoordinationRun | null>;
    list(workspaceId: string, input: Record<string, unknown>): Promise<CoordinationRun[]>;
    lease(workspaceId: string, taskId: string): Promise<TaskLease>;
    saveLease(lease: TaskLease): Promise<void>;
    saveRun(run: CoordinationRun): Promise<void>;
    comment(userId: string, taskId: string, body: string): Promise<void>;
    event(run: CoordinationRun, action: string, actorId: string): Promise<void>;
    completeTask(userId: string, task: CoordinationTask, expectedVersion: number): Promise<void>;
}
export interface CoordinationStore {
    transaction<T>(operation: (session: CoordinationSession) => Promise<T>): Promise<T>;
}
export type CoordinationErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'version_conflict' | 'lease_conflict' | 'lease_expired' | 'stale_fence';
export class CoordinationError extends Error {
    readonly code: CoordinationErrorCode;
    constructor(code: CoordinationErrorCode) { super(code); this.name = 'CoordinationError'; this.code = code; }
}
function deny(code: CoordinationErrorCode): never { throw new CoordinationError(code); }
const terminal = new Set<CoordinationRun['state']>(['succeeded', 'failed', 'cancelled']);
const identity = z.object({ userId: z.uuid(), clientId: z.string().min(1).max(200), grantId: z.uuid() });
function permission(task: CoordinationTask, userId: string) { if (!canChangeTask(task, userId, 'toggle'))
    deny('forbidden'); }
function activeLease(lease: TaskLease, run: CoordinationRun, token: string, now: Date) {
    if (lease.holderRunId !== run.id || lease.fencingToken !== token || run.fencingToken !== token)
        deny('stale_fence');
    if (!lease.leaseExpiresAt || Date.parse(lease.leaseExpiresAt) <= now.getTime())
        deny('lease_expired');
}
export interface CoordinationRunPage {
    items: CoordinationRun[];
    nextCursor: string | null;
}
export function createCoordinationService(store: CoordinationStore) {
    async function call(name: 'agent_runs.list', context: HandlerContext): Promise<CoordinationRunPage>;
    async function call(name: Exclude<CoordinationToolName, 'agent_runs.list'>, context: HandlerContext): Promise<CoordinationRun>;
    async function call(name: CoordinationToolName, context: HandlerContext): Promise<CoordinationRun | CoordinationRunPage>;
    async function call(name: CoordinationToolName, context: HandlerContext): Promise<CoordinationRun | CoordinationRunPage> {
        const parsed = coordinationToolSchemas[name].input.safeParse(context.input);
        if (!parsed.success || !identity.safeParse(context.principal).success)
            deny('invalid_input');
        const input = parsed.data as Record<string, unknown>, principal = context.principal, workspaceId = String(input.workspaceId);
        if (principal.workspaceIds !== null && !principal.workspaceIds.includes(workspaceId))
            deny('forbidden');
        const scope = coordinationScopeFor(name);
        if (!principal.capabilities.includes(scope))
            deny('forbidden');
        return store.transaction(async (session) => {
            await session.authorize(principal, workspaceId, scope, scope === "agent_runs:read" ? "read" : name === "agent_runs.report" ? "comment" : "edit");
            if (name === 'agent_runs.list') {
                if (input.taskId)
                    await session.task(workspaceId, String(input.taskId));
                const rows = await session.list(workspaceId, input), limit = Number(input.limit);
                return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
            }
            if (name === 'agent_runs.claim') {
                const task = await session.task(workspaceId, String(input.taskId));
                permission(task, principal.userId);
                if (task.version !== input.expectedVersion)
                    deny('version_conflict');
                if (task.status === 'done')
                    deny('invalid_state');
                const lease = await session.lease(workspaceId, task.id), now = await session.now();
                if (lease.holderRunId && lease.leaseExpiresAt && Date.parse(lease.leaseExpiresAt) > now.getTime())
                    deny('lease_conflict');
                if (lease.holderRunId) {
                    const old = await session.run(lease.holderRunId);
                    if (old && !terminal.has(old.state)) {
                        const expired = { ...old, state: 'failed' as const, progress: 'Lease expired', updatedAt: now.toISOString(), version: old.version + 1 };
                        await session.saveRun(expired);
                        await session.event(expired, 'agent_run_lease_expired', principal.userId);
                    }
                }
                const next = (BigInt(lease.fencingToken) + BigInt(1)).toString();
                const run: CoordinationRun = { id: randomUUID(), workspaceId, taskId: task.id, actorUserId: principal.userId, clientId: principal.clientId, grantId: principal.grantId, state: 'queued', fencingToken: next, leaseExpiresAt: new Date(now.getTime() + Number(input.leaseSeconds) * 1000).toISOString(), progress: null, evidence: [], reviewerUserId: null, reviewComment: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 1 };
                runRecordSchema.parse(run);
                await session.saveRun(run);
                await session.saveLease({ ...lease, holderRunId: run.id, fencingToken: next, leaseExpiresAt: run.leaseExpiresAt });
                await session.event(run, 'agent_run_claimed', principal.userId);
                return run;
            }
            const run = await session.run(String(input.runId));
            if (!run || run.workspaceId !== workspaceId)
                deny('not_found');
            if (name === 'agent_runs.get')
                return run;
            if (terminal.has(run.state) && run.state !== 'failed')
                deny('invalid_state');
            const task = await session.task(workspaceId, run.taskId);
            permission(task, principal.userId);
            const lease = await session.lease(workspaceId, task.id), now = await session.now();
            if (name === 'agent_runs.cancel')
                permission(task, principal.userId);
            else {
                if (run.actorUserId !== principal.userId || run.clientId !== principal.clientId || run.grantId !== principal.grantId)
                    deny('forbidden');
                activeLease(lease, run, String(input.fencingToken), now);
            }
            if (terminal.has(run.state))
                deny('invalid_state');
            const updated: CoordinationRun = { ...run, updatedAt: now.toISOString(), version: run.version + 1 };
            if (name === 'agent_runs.start') {
                if (run.state !== 'queued')
                    deny('invalid_state');
                updated.state = 'running';
            }
            else if (name === 'agent_runs.heartbeat') {
                updated.leaseExpiresAt = new Date(now.getTime() + Number(input.leaseSeconds) * 1000).toISOString();
                await session.saveLease({ ...lease, leaseExpiresAt: updated.leaseExpiresAt });
            }
            else if (name === 'agent_runs.report') {
                if (run.state !== 'running')
                    deny('invalid_state');
                updated.progress = String(input.progress);
                await session.comment(principal.userId, task.id, updated.progress);
            }
            else if (name === 'agent_runs.submit_review') {
                if (run.state !== 'running')
                    deny('invalid_state');
                updated.state = 'awaiting_review';
                updated.evidence = input.evidence as CoordinationRun['evidence'];
            }
            else if (name === 'agent_runs.cancel' || name === 'agent_runs.release') {
                updated.state = 'cancelled';
                updated.progress = typeof input.reason === 'string' ? input.reason : run.progress;
                // This cancels future coordinator writes only; it makes no claim about the remote process.
                if (lease.holderRunId === run.id)
                    await session.saveLease({ ...lease, holderRunId: null, leaseExpiresAt: null });
            }
            await session.saveRun(updated);
            if (name !== 'agent_runs.heartbeat')
                await session.event(updated, name.replace('agent_runs.', 'agent_run_'), principal.userId);
            return updated;
        });
    }
    /** Only a server-authenticated interactive human action may call this API; MCP handlers do not expose it. */
    async function review(args: {
        reviewerUserId: string;
        input: HumanReviewInput;
    }): Promise<CoordinationRun> {
        if (!z.uuid().safeParse(args.reviewerUserId).success)
            deny('invalid_input');
        const parsed = humanReviewInputSchema.safeParse(args.input);
        if (!parsed.success)
            deny('invalid_input');
        const input = parsed.data;
        return store.transaction(async (session) => {
            await session.authorizeHuman(args.reviewerUserId, input.workspaceId);
            const run = await session.run(input.runId);
            if (!run || run.workspaceId !== input.workspaceId)
                deny('not_found');
            if (run.state !== 'awaiting_review')
                deny('invalid_state');
            const task = await session.task(input.workspaceId, run.taskId);
            permission(task, args.reviewerUserId);
            if (task.version !== input.expectedTaskVersion)
                deny('version_conflict');
            const lease = await session.lease(input.workspaceId, task.id), now = await session.now();
            activeLease(lease, run, run.fencingToken, now);
            if (input.decision === 'approve')
                await session.authorizeOrigin(run);
            if (input.decision === 'approve')
                await session.completeTask(args.reviewerUserId, task, input.expectedTaskVersion);
            if (terminal.has(run.state))
                deny('invalid_state');
            const updated: CoordinationRun = { ...run, state: input.decision === 'approve' ? 'succeeded' : 'failed', reviewerUserId: args.reviewerUserId, reviewComment: input.comment ?? null, updatedAt: now.toISOString(), version: run.version + 1 };
            await session.saveRun(updated);
            await session.saveLease({ ...lease, holderRunId: null, leaseExpiresAt: null });
            await session.event(updated, `agent_run_review_${input.decision}`, args.reviewerUserId);
            return updated;
        });
    }
    return { call, review };
}
