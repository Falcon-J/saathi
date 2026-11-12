import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coordinationToolSchemas } from './contracts.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('claims require finite lease TTL and explicit UUID task scope', () => {
    const schema = coordinationToolSchemas['agent_runs.claim'].input;
    assert.equal(schema.safeParse({ commandId: id, expectedVersion: 2, workspaceId: id, taskId: id, leaseSeconds: 60 }).success, true);
    for (const leaseSeconds of [undefined, 0, -1, Infinity, 3601])
        assert.equal(schema.safeParse({ commandId: id, expectedVersion: 2, workspaceId: id, taskId: id, leaseSeconds }).success, false);
    assert.equal(schema.safeParse({ commandId: id, expectedVersion: 2, workspaceId: id, taskId: id, leaseSeconds: 60, agentId: 'model-name' }).success, false);
});
test('coordination writes require decimal fencing tokens and bounded evidence', () => {
    const input = { commandId: id, expectedVersion: null, workspaceId: id, runId: id, fencingToken: '1', evidence: [{ kind: 'text', text: 'Test suite passed' }] };
    assert.equal(coordinationToolSchemas['agent_runs.submit_review'].input.safeParse(input).success, true);
    assert.equal(coordinationToolSchemas['agent_runs.submit_review'].input.safeParse({ ...input, fencingToken: 1 }).success, false);
    assert.equal(coordinationToolSchemas['agent_runs.submit_review'].input.safeParse({ ...input, evidence: [{ kind: 'uri', uri: 'javascript:alert(1)' }] }).success, false);
    assert.equal(coordinationToolSchemas['agent_runs.submit_review'].input.safeParse({ ...input, evidence: [{ kind: 'text', text: 'x'.repeat(4001) }] }).success, false);
});
test('malformed decimal fencing values are rejected without throwing', () => {
    assert.equal(coordinationToolSchemas['agent_runs.start'].input.safeParse({ commandId: id, expectedVersion: null, workspaceId: id, runId: id, fencingToken: 'not-a-token' }).success, false);
});
