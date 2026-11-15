import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoordinationService } from './service.ts';
import type { CoordinationSession, CoordinationStore, CoordinationTask, TaskLease } from './service.ts';
import type { CoordinationRun } from './contracts.ts';
import type { HandlerContext } from '../platform/executor.ts';
const actor = '11111111-1111-4111-8111-111111111111', workspaceId = '22222222-2222-4222-8222-222222222222', taskId = '33333333-3333-4333-8333-333333333333', grantId = '44444444-4444-4444-8444-444444444444';
function fixture() {
    let clock = new Date('2026-11-12T12:00:00Z'), authorized = true, version = 2, tail = Promise.resolve(), completions = 0;
    const runs = new Map<string, CoordinationRun>(), leases = new Map<string, TaskLease>(), events: string[] = [];
    const task: CoordinationTask = { id: taskId, workspaceId, version: 2, status: 'todo', ownerId: actor, creatorId: actor, assigneeId: null };
    const session: CoordinationSession = { now: async () => clock, authorize: async () => { if (!authorized)
            throw Object.assign(new Error('Revoked'), { code: 'forbidden' }); }, authorizeHuman: async () => { }, authorizeOrigin: async () => { if (!authorized)
            throw Object.assign(new Error("Revoked"), { code: "forbidden" }); }, task: async (w, t) => { if (w !== workspaceId || t !== taskId)
            throw Object.assign(new Error('Not found'), { code: 'not_found' }); return { ...task, version }; }, run: async (id) => structuredClone(runs.get(id) ?? null), list: async () => [...runs.values()], lease: async () => structuredClone(leases.get(taskId) ?? { workspaceId, taskId, holderRunId: null, fencingToken: '0', leaseExpiresAt: null }), saveLease: async (lease) => { leases.set(taskId, structuredClone(lease)); }, saveRun: async (run) => { runs.set(run.id, structuredClone(run)); }, comment: async () => { }, event: async (_run, action) => { events.push(action); }, completeTask: async (_actor, _task, expected) => { if (expected !== version)
            throw Object.assign(new Error('Changed'), { code: 'version_conflict' }); version++; completions++; } };
    const store: CoordinationStore = { async transaction(operation) { const prior = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await prior; const before = structuredClone([...runs]), beforeLeases = structuredClone([...leases]); try {
            return await operation(session);
        }
        catch (e) {
            runs.clear();
            for (const [k, v] of before)
                runs.set(k, v);
            leases.clear();
            for (const [k, v] of beforeLeases)
                leases.set(k, v);
            throw e;
        }
        finally {
            release();
        } } };
    const service = createCoordinationService(store);
    const context = (input: Record<string, unknown>): HandlerContext => ({ principal: { userId: actor, clientId: 'verified-client', grantId, capabilities: ['agent_runs:read', 'agent_runs:write'], workspaceIds: null }, input: { workspaceId, commandId: actor, expectedVersion: null, ...input } });
    const claim = () => service.call('agent_runs.claim', context({ taskId, expectedVersion: version, leaseSeconds: 60 }));
    const held = (run: CoordinationRun, extra: Record<string, unknown> = {}) => context({ runId: run.id, fencingToken: run.fencingToken, ...extra });
    return { service, claim, held, context, runs, leases, events, task, setClock: (value: string) => { clock = new Date(value); }, revoke: () => { authorized = false; }, bump: () => { version++; }, completions: () => completions };
}
test('double claim grants one exclusive lease and expired takeover fences old holder', async () => {
    const f = fixture(), results = await Promise.allSettled([f.claim(), f.claim()]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const first = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<CoordinationRun>).value;
    assert.equal(first.state, 'queued');
    assert.equal(first.fencingToken, '1');
    f.setClock('2026-11-12T12:01:01Z');
    const second = await f.claim();
    assert.equal(second.fencingToken, '2');
    assert.equal(f.runs.get(first.id)?.state, 'failed');
    await assert.rejects(f.service.call('agent_runs.report', f.held(first, { progress: 'Late update' })), { code: 'stale_fence' });
});
test('revoked grant and fake task scope cannot claim or heartbeat', async () => {
    const f = fixture(), run = await f.claim();
    f.revoke();
    await assert.rejects(f.service.call('agent_runs.heartbeat', f.held(run, { leaseSeconds: 60 })), { code: 'forbidden' });
    const other = fixture();
    await assert.rejects(other.service.call('agent_runs.claim', other.context({ taskId: actor, expectedVersion: 2, leaseSeconds: 60 })), { code: 'not_found' });
    other.task.ownerId = grantId;
    other.task.creatorId = grantId;
    await assert.rejects(other.claim(), { code: 'forbidden' });
});
test('submission is advisory and human review requires the exact current task version', async () => {
    const f = fixture(), run = await f.claim();
    await f.service.call('agent_runs.start', f.held(run));
    const submitted = await f.service.call('agent_runs.submit_review', f.held(run, { evidence: [{ kind: 'text', text: 'Checks passed' }] }));
    assert.equal(submitted.state, 'awaiting_review');
    assert.equal(f.completions(), 0);
    f.bump();
    await assert.rejects(f.service.review({ reviewerUserId: actor, input: { workspaceId, runId: run.id, decision: 'approve', expectedTaskVersion: 2, commandId: grantId } }), { code: 'version_conflict' });
    assert.equal(f.runs.get(run.id)?.state, 'awaiting_review');
    assert.equal(f.completions(), 0);
    const reviewed = await f.service.review({ reviewerUserId: actor, input: { workspaceId, runId: run.id, decision: 'approve', expectedTaskVersion: 3, commandId: grantId } });
    assert.equal(reviewed.state, 'succeeded');
    assert.equal(f.completions(), 1);
});
test('cancellation wins against subsequent coordinator writes and heartbeat emits no activity', async () => {
    const f = fixture(), run = await f.claim(), before = f.events.length;
    await f.service.call('agent_runs.heartbeat', f.held(run, { leaseSeconds: 60 }));
    assert.equal(f.events.length, before);
    const cancellation = f.context({ runId: run.id, reason: 'Stop coordination' });
    cancellation.principal.capabilities = [...cancellation.principal.capabilities, 'agent_runs:cancel'];
    const race = await Promise.allSettled([f.service.call('agent_runs.cancel', cancellation), f.service.call('agent_runs.heartbeat', f.held(run, { leaseSeconds: 60 }))]);
    assert.equal(race[0].status, 'fulfilled');
    assert.equal(race[1].status, 'rejected');
    await assert.rejects(f.service.call('agent_runs.start', f.held(run)), { code: 'invalid_state' });
    assert.equal(f.runs.get(run.id)?.state, 'cancelled');
    assert.equal(f.leases.get(taskId)?.holderRunId, null);
});
for(const name of ['agent_runs.cancel','agent_runs.release'] as const)test(`ordinary work scope cannot ${name}; explicit operation scope is required`,async()=>{
 const f=fixture(),run=await f.claim(),context=name==='agent_runs.cancel'?f.context({runId:run.id}):f.held(run)
 await assert.rejects(f.service.call(name,context),{code:'forbidden'})
 assert.equal(f.runs.get(run.id)?.state,'queued')
 context.principal.capabilities=[...context.principal.capabilities,name==='agent_runs.cancel'?'agent_runs:cancel':'agent_runs:release']
 assert.equal((await f.service.call(name,context)).state,'cancelled')
})
