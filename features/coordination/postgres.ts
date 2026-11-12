import { assertWorkspaceAccess } from "../access/service.ts";
import { getDb } from '../../lib/db/client.ts';
import type { Transaction } from '../../lib/db/client.ts';
import { getCurrentTransaction, withTransactionContext } from '../../lib/db/transaction-context.ts';
import { changeTaskRecord } from '../../lib/data/tasks.ts';
import { createTaskComment } from '../../lib/data/comments.ts';
import { appendDomainEvent } from '../../lib/data/events.ts';
import { runRecordSchema } from './contracts.ts';
import type { CoordinationRun } from './contracts.ts';
import { CoordinationError } from './service.ts';
import type { CoordinationSession, CoordinationStore } from './service.ts';
import type { PlatformPrincipal } from '../platform/executor.ts';
const deny = (): never => { throw new CoordinationError('forbidden'); };
const iso = (value: unknown) => new Date(value as string | Date).toISOString();
function project(row: Record<string, unknown>): CoordinationRun {
    return runRecordSchema.parse({ id: row.id, workspaceId: row.workspace_id, taskId: row.task_id, actorUserId: row.actor_user_id, clientId: row.client_id, grantId: row.grant_id, state: row.state, fencingToken: String(row.fencing_token), leaseExpiresAt: iso(row.lease_expires_at), progress: row.progress, evidence: row.evidence, reviewerUserId: row.reviewer_user_id, reviewComment: row.review_comment, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: row.version });
}
function session(tx: Transaction): CoordinationSession {
    async function lockMembership(userId: string, workspaceId: string) {
        const [row] = await tx `SELECT w.id,w.archived_at FROM workspaces w WHERE w.id=${workspaceId} AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w.id AND m.user_id=${userId}) FOR UPDATE`;
        if (!row || row.archived_at)
            deny();
    }
    async function currentGrant(principal: Pick<PlatformPrincipal, 'userId' | 'clientId' | 'grantId'>, workspaceId: string, scope: string) {
        const [grant] = await tx `SELECT capabilities,workspace_ids FROM platform_delegations WHERE id=${principal.grantId} AND actor_user_id=${principal.userId} AND client_id=${principal.clientId} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE`;
        if (!grant || !Array.isArray(grant.capabilities) || !grant.capabilities.includes(scope) || grant.workspace_ids !== null && (!Array.isArray(grant.workspace_ids) || !grant.workspace_ids.includes(workspaceId)))
            deny();
    }
    return {
        async now() { const [row] = await tx `SELECT clock_timestamp() AS now`; return new Date(row.now); },
        async authorize(principal, workspaceId, scope, capability) { await currentGrant(principal, workspaceId, scope); await lockMembership(principal.userId, workspaceId); await assertWorkspaceAccess(principal.userId, workspaceId, capability, tx); },
        async authorizeHuman(userId, workspaceId, capability = "edit") { await lockMembership(userId, workspaceId); await assertWorkspaceAccess(userId, workspaceId, capability, tx); },
        async authorizeOrigin(run) { await currentGrant({ userId: run.actorUserId, clientId: run.clientId, grantId: run.grantId }, run.workspaceId, 'agent_runs:write'); const [member] = await tx `SELECT user_id FROM workspace_members WHERE workspace_id=${run.workspaceId} AND user_id=${run.actorUserId}`; if (!member)
            deny(); await assertWorkspaceAccess(run.actorUserId, run.workspaceId, "edit", tx); },
        async task(workspaceId, taskId) {
            const [row] = await tx `SELECT t.id,t.workspace_id,t.version,t.status,t.created_by_user_id,t.assignee_user_id,w.owner_user_id FROM tasks t JOIN workspaces w ON w.id=t.workspace_id WHERE t.id=${taskId} AND t.workspace_id=${workspaceId} FOR UPDATE OF t`;
            if (!row)
                throw new CoordinationError('not_found');
            return { id: row.id, workspaceId: row.workspace_id, version: row.version, status: row.status, ownerId: row.owner_user_id, creatorId: row.created_by_user_id, assigneeId: row.assignee_user_id };
        },
        async run(runId) { const [row] = await tx `SELECT * FROM agent_runs WHERE id=${runId} FOR UPDATE`; return row ? project(row) : null; },
        async list(workspaceId, input) {
            const taskId = typeof input.taskId === "string" ? input.taskId : null, state = typeof input.state === "string" ? input.state : null, cursor = typeof input.cursor === "string" ? input.cursor : null;
            const rows = await tx `SELECT * FROM agent_runs WHERE workspace_id=${workspaceId} AND (${taskId}::uuid IS NULL OR task_id=${taskId}::uuid) AND (${state}::text IS NULL OR state=${state}) AND (${cursor}::uuid IS NULL OR id>${cursor}::uuid) ORDER BY id LIMIT ${Number(input.limit) + 1}`;
            return rows.map(project);
        },
        async lease(workspaceId, taskId) {
            await tx `INSERT INTO task_agent_leases(workspace_id,task_id) VALUES (${workspaceId},${taskId}) ON CONFLICT(workspace_id,task_id) DO NOTHING`;
            const [row] = await tx `SELECT * FROM task_agent_leases WHERE workspace_id=${workspaceId} AND task_id=${taskId} FOR UPDATE`;
            return { workspaceId, taskId, holderRunId: row.holder_run_id, fencingToken: String(row.fencing_token), leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null };
        },
        async saveLease(lease) { await tx `UPDATE task_agent_leases SET holder_run_id=${lease.holderRunId},fencing_token=${lease.fencingToken},lease_expires_at=${lease.leaseExpiresAt} WHERE workspace_id=${lease.workspaceId} AND task_id=${lease.taskId}`; },
        async saveRun(run) {
            await tx `INSERT INTO agent_runs(id,workspace_id,task_id,actor_user_id,client_id,grant_id,state,fencing_token,lease_expires_at,progress,evidence,reviewer_user_id,review_comment,version,created_at,updated_at) VALUES (${run.id},${run.workspaceId},${run.taskId},${run.actorUserId},${run.clientId},${run.grantId},${run.state},${run.fencingToken},${run.leaseExpiresAt},${run.progress},${tx.json(run.evidence as never)},${run.reviewerUserId},${run.reviewComment},${run.version},${run.createdAt},${run.updatedAt}) ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state,lease_expires_at=EXCLUDED.lease_expires_at,progress=EXCLUDED.progress,evidence=EXCLUDED.evidence,reviewer_user_id=EXCLUDED.reviewer_user_id,review_comment=EXCLUDED.review_comment,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at`;
        },
        async comment(userId, taskId, body) { await createTaskComment(userId, taskId, body); },
        async event(run, action, actorId) { await appendDomainEvent(tx, { workspaceId: run.workspaceId, actorUserId: actorId, type: 'task-updated', entityType: 'agent_run', entityId: run.id, metadata: { action, taskId: run.taskId, state: run.state }, payload: { taskId: run.taskId, agentRunId: run.id } }); },
        async completeTask(userId, task, expectedVersion) {
            // Existing policy grants assignees completion through toggle only. Under this row lock,
            // a guarded non-done -> done transition can never reopen an already completed task.
            if (task.status !== 'done')
                await changeTaskRecord(userId, task.id, 'toggle', {}, expectedVersion);
        },
    };
}
export const postgresCoordinationStore: CoordinationStore = {
    async transaction<T>(operation: (session: CoordinationSession) => Promise<T>): Promise<T> {
        const active = getCurrentTransaction();
        if (active)
            return operation(session(active));
        return await getDb().begin(async (tx) => withTransactionContext(tx, () => operation(session(tx)))) as T;
    },
};
import { coordinationToolSchemas } from './contracts.ts';
import { z } from 'zod';
import { canChangeTask } from '../../lib/task-permission.ts';
export type HumanCoordinationRun = CoordinationRun & { task: { id: string; title: string; version: number; canReview: boolean } };
/** Trusted human session read. One bounded run/task batch avoids per-run domain reads. */
export async function listCoordinationRunsForHuman(args: { userId: string; input: { workspaceId: string; cursor?: string; limit?: number } }): Promise<{ items: HumanCoordinationRun[]; nextCursor: string | null }> {
    z.uuid().parse(args.userId);
    const input = coordinationToolSchemas['agent_runs.list'].input.parse(args.input);
    return postgresCoordinationStore.transaction(async authorized => {
        await authorized.authorizeHuman(args.userId, input.workspaceId, 'read');
        const tx = getCurrentTransaction()!;
        const access = await assertWorkspaceAccess(args.userId, input.workspaceId, 'read', tx);
        const rows = await tx`SELECT r.*,t.title AS task_title,t.version AS task_version,t.created_by_user_id,t.assignee_user_id,w.owner_user_id,
            COALESCE(l.holder_run_id=r.id AND l.fencing_token=r.fencing_token AND l.lease_expires_at>clock_timestamp(),false) AS lease_active
            FROM agent_runs r JOIN tasks t ON t.id=r.task_id AND t.workspace_id=r.workspace_id JOIN workspaces w ON w.id=r.workspace_id
            LEFT JOIN task_agent_leases l ON l.workspace_id=r.workspace_id AND l.task_id=r.task_id
            WHERE r.workspace_id=${input.workspaceId} AND (${input.cursor ?? null}::uuid IS NULL OR r.id>${input.cursor ?? null}::uuid)
            ORDER BY r.id LIMIT ${input.limit + 1}`;
        const visible = rows.slice(0, input.limit);
        return { items: visible.map(row => {
            const run = project(row);
            const canReview = run.state === 'awaiting_review' && Boolean(row.lease_active) && access.capabilities.includes('edit') && canChangeTask({ ownerId: row.owner_user_id, creatorId: row.created_by_user_id, assigneeId: row.assignee_user_id }, args.userId, 'toggle');
            return { ...run, task: { id: run.taskId, title: String(row.task_title), version: Number(row.task_version), canReview } };
        }), nextCursor: rows.length > input.limit ? visible[visible.length - 1].id : null };
    });
}
