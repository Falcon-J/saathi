import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getDb } from '../../lib/db/client.ts';
import { createWorkspaceRecord } from '../../lib/data/workspaces.ts';
import { createTaskRecord, changeTaskRecord } from '../../lib/data/tasks.ts';
import { executeWithReceipt } from '../platform/receipts.ts';
import type { HandlerContext, PlatformPrincipal } from '../platform/executor.ts';
import { createCoordinationHandlers, reviewCoordinationRun } from './handlers.ts';
import { runRecordSchema } from './contracts.ts';
import type { CoordinationRun, CoordinationToolName } from './contracts.ts';
const connection = process.env.DATABASE_TEST_URL;
if (connection) {
    const target = new URL(connection);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only loopback DATABASE_TEST_URL fixtures are allowed');
    process.env.DATABASE_URL = connection;
    process.env.DATABASE_POOL_MAX = '5';
}
test('real PostgreSQL agent coordination fencing, authorization and human review', { skip: !connection }, async (t) => {
    const db = getDb(), owner = randomUUID(), outsider = randomUUID(), actors = [owner, outsider], clientId = `coordination-integration-${randomUUID()}`, grantId = randomUUID(), otherGrant = randomUUID();
    const [presence] = await db `SELECT to_regclass('public.agent_runs') IS NOT NULL AS runs,to_regclass('public.task_agent_leases') IS NOT NULL AS leases`;
    if (!presence.runs || !presence.leases) {
        await db.end();
        assert.fail('Apply normal migration 0012 before coordination integration');
    }
    const scopes = ['agent_runs:read', 'agent_runs:write'], principal: PlatformPrincipal = { userId: owner, clientId, grantId, capabilities: scopes, workspaceIds: null };
    const handlers = createCoordinationHandlers();
    let workspaceId = '';
    const input = (extra: Record<string, unknown>) => ({ commandId: randomUUID(), expectedVersion: null, workspaceId, ...extra });
    async function call(name: CoordinationToolName, raw: Record<string, unknown>, actor = principal) {
        const context: HandlerContext = { input: raw, principal: actor };
        const result = name === 'agent_runs.list' || name === 'agent_runs.get' ? { result: await handlers[name](context), replayed: false } : await executeWithReceipt({ actorId: actor.userId, clientId: actor.clientId, commandId: String(raw.commandId), commandType: name, input: raw, workspaceId: String(raw.workspaceId), authorize: async () => { }, execute: () => handlers[name](context) });
        if (name !== 'agent_runs.list')
            runRecordSchema.parse(result.result.data);
        return result;
    }
    const claim = (taskId: string) => call('agent_runs.claim', input({ taskId, expectedVersion: 1, leaseSeconds: 60 }));
    const held = (run: CoordinationRun, extra: Record<string, unknown> = {}) => input({ runId: run.id, fencingToken: run.fencingToken, ...extra });
    try {
        for (const id of actors)
            await db `INSERT INTO auth.users(id,email) VALUES (${id},${id + '@coordination.integration.test'})`;
        await db `INSERT INTO platform_delegations(id,actor_user_id,client_id,capabilities) VALUES (${grantId},${owner},${clientId},${db.json(scopes)}),(${otherGrant},${outsider},${clientId},${db.json(scopes)})`;
        const ws = await createWorkspaceRecord(owner, { name: 'Coordination integration' });
        workspaceId = ws.id;
        const task = await createTaskRecord(owner, workspaceId, { title: 'Execute externally and review explicitly' });
        let first!: CoordinationRun, second!: CoordinationRun;
        await t.test('simultaneous claims commit one lease; one rejects; duplicate receipt replays one run', async () => {
            const request = input({ taskId: task.id, expectedVersion: 1, leaseSeconds: 60 });
            const results = await Promise.allSettled([call('agent_runs.claim', request), claim(task.id)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            const win = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof call>>>;
            first = win.value.result.data as CoordinationRun;
            const loser = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
            assert.equal(loser.reason.code, 'lease_conflict');
            assert.equal((await db `SELECT id FROM agent_runs WHERE task_id=${task.id}`).length, 1);
            if (results[0].status === 'fulfilled') {
                const replay = await call('agent_runs.claim', request);
                assert.equal(replay.replayed, true);
                assert.equal((replay.result.data as CoordinationRun).id, first.id);
            }
        });
        await t.test('database-clock expired takeover increments fencing and denies stale holder writes', async () => {
            await db `UPDATE task_agent_leases SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE workspace_id=${workspaceId} AND task_id=${task.id}`;
            second = (await claim(task.id)).result.data as CoordinationRun;
            assert.equal(BigInt(second.fencingToken), BigInt(first.fencingToken) + BigInt(1));
            await assert.rejects(call('agent_runs.heartbeat', held(first, { leaseSeconds: 60 })), { code: 'stale_fence' });
            const before = (await db `SELECT count(*)::int AS n FROM activity_events WHERE workspace_id=${workspaceId}`)[0].n;
            await call('agent_runs.heartbeat', held(second, { leaseSeconds: 60 }));
            assert.equal((await db `SELECT count(*)::int AS n FROM activity_events WHERE workspace_id=${workspaceId}`)[0].n, before);
        });
        await t.test('latest revoked grant, workspace allowlist and membership are enforced in DAL', async () => {
            await db `UPDATE platform_delegations SET revoked_at=clock_timestamp() WHERE id=${grantId}`;
            await assert.rejects(call('agent_runs.start', held(second)), { code: 'forbidden' });
            await db `UPDATE platform_delegations SET revoked_at=NULL,workspace_ids=${db.json([randomUUID()])} WHERE id=${grantId}`;
            await assert.rejects(call('agent_runs.start', held(second)), { code: 'forbidden' });
            await db `UPDATE platform_delegations SET workspace_ids=NULL WHERE id=${grantId}`;
            await assert.rejects(call('agent_runs.get', { workspaceId, runId: second.id }, { ...principal, userId: outsider, grantId: otherGrant }), { code: 'forbidden' });
            await call('agent_runs.start', held(second));
            await call('agent_runs.report', held(second, { progress: 'External client completed checks' }));
            assert.equal((await db `SELECT id FROM task_comments WHERE task_id=${task.id}`).length, 1);
        });
        await t.test('evidence does not complete work; version conflict preserves review; human approval commits task and outbox', async () => {
            await call('agent_runs.submit_review', held(second, { evidence: [{ kind: 'text', text: 'All requested checks passed' }, { kind: 'uri', uri: 'https://example.test/evidence', label: 'External evidence, never fetched' }] }));
            assert.equal((await db `SELECT status FROM tasks WHERE id=${task.id}`)[0].status, 'todo');
            await changeTaskRecord(owner, task.id, 'edit', { description: 'Human updated scope' }, 1);
            await assert.rejects(reviewCoordinationRun({ reviewerUserId: owner, input: { commandId: randomUUID(), workspaceId, runId: second.id, decision: 'approve', expectedTaskVersion: 1 } }), { code: 'version_conflict' });
            assert.equal((await db `SELECT state FROM agent_runs WHERE id=${second.id}`)[0].state, 'awaiting_review');
            const approved = await reviewCoordinationRun({ reviewerUserId: owner, input: { commandId: randomUUID(), workspaceId, runId: second.id, decision: 'approve', expectedTaskVersion: 2, comment: 'Reviewed external evidence' } });
            assert.equal(approved.result.state, 'succeeded');
            assert.equal((await db `SELECT status FROM tasks WHERE id=${task.id}`)[0].status, 'done');
            assert.ok((await db `SELECT id FROM outbox_events WHERE workspace_id=${workspaceId} AND payload->'data'->>'agentRunId'=${second.id}`).length > 0);
            assert.equal((await db `SELECT holder_run_id FROM task_agent_leases WHERE task_id=${task.id}`)[0].holder_run_id, null);
        });
        await t.test('cancellation prevents future heartbeat and preserves explicit remote-execution boundary', async () => {
            const other = await createTaskRecord(owner, workspaceId, { title: 'Cancellation target' }), run = (await claim(other.id)).result.data as CoordinationRun;
            await assert.rejects(call('agent_runs.cancel', input({ runId: run.id, reason: 'Not consented' })), { code: 'forbidden' });
            principal.capabilities = [...scopes, 'agent_runs:cancel'];
            await db`UPDATE platform_delegations SET capabilities=${db.json([...principal.capabilities])} WHERE id=${grantId}`;
            await call('agent_runs.cancel', input({ runId: run.id, reason: 'Coordinator released; external client must observe cancellation' }));
            await assert.rejects(call('agent_runs.heartbeat', held(run, { leaseSeconds: 60 })), { code: 'invalid_state' });
            assert.equal((await db `SELECT state FROM agent_runs WHERE id=${run.id}`)[0].state, 'cancelled');
            const read = await call('agent_runs.get', { workspaceId, runId: run.id });
            assert.equal((read.result.data as CoordinationRun).state, 'cancelled');
            const page = await call('agent_runs.list', { workspaceId, limit: 1 });
            assert.equal((page.result.data as {
                items: unknown[];
            }).items.length, 1);
        });
        await t.test('release requires its own current delegation capability', async () => {
            const other = await createTaskRecord(owner, workspaceId, { title: 'Explicit release target' });
            const run = (await claim(other.id)).result.data as CoordinationRun;
            await assert.rejects(call('agent_runs.release', held(run)), { code: 'forbidden' });
            principal.capabilities = [...scopes, 'agent_runs:release'];
            await db`UPDATE platform_delegations SET capabilities=${db.json([...principal.capabilities])} WHERE id=${grantId}`;
            const released = await call('agent_runs.release', held(run));
            assert.equal((released.result.data as CoordinationRun).state, 'cancelled');
            assert.equal((await db`SELECT holder_run_id FROM task_agent_leases WHERE task_id=${other.id}`)[0].holder_run_id, null);
        });
    }
    finally {
        try {
            await db `DELETE FROM platform_command_receipts WHERE actor_user_id=ANY(${db.array(actors, 2950)})`;
            await db `DELETE FROM outbox_events WHERE workspace_id IN (SELECT workspace_id FROM activity_events WHERE actor_user_id=ANY(${db.array(actors, 2950)}))`;
            await db `DELETE FROM activity_events WHERE actor_user_id=ANY(${db.array(actors, 2950)})`;
            await db `DELETE FROM workspaces WHERE owner_user_id=ANY(${db.array(actors, 2950)})`;
            await db `DELETE FROM platform_delegations WHERE actor_user_id=ANY(${db.array(actors, 2950)})`;
            await db `DELETE FROM profiles WHERE id=ANY(${db.array(actors, 2950)})`;
            await db `DELETE FROM auth.users WHERE id=ANY(${db.array(actors, 2950)})`;
            const [remaining] = await db `SELECT (SELECT count(*)::int FROM agent_runs WHERE actor_user_id=ANY(${db.array(actors, 2950)})) AS runs,(SELECT count(*)::int FROM task_agent_leases WHERE workspace_id=${workspaceId || null}::uuid) AS leases,(SELECT count(*)::int FROM auth.users WHERE id=ANY(${db.array(actors, 2950)})) AS users`;
            assert.deepEqual(remaining, { runs: 0, leases: 0, users: 0 });
            console.log('Local coordination fixture cleanup verified: runs=0 leases=0 users=0');
        }
        finally {
            await db.end();
        }
    }
});
