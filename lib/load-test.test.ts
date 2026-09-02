import assert from "node:assert/strict"
import test from "node:test"
import {
  evaluateBenchmark,
  extractBenchmarkLatency,
  isLoadTestSecretValid,
  requireLoadTestWorkspaceId,
} from "./load-test.ts"

test("accepts the configured load-test secret", () => {
  assert.equal(isLoadTestSecretValid("correct-secret", "correct-secret"), true)
})

test("rejects missing or incorrect load-test secrets", () => {
  assert.equal(isLoadTestSecretValid(null, "correct-secret"), false)
  assert.equal(isLoadTestSecretValid("wrong-secret", "correct-secret"), false)
  assert.equal(isLoadTestSecretValid("correct-secret", undefined), false)
})

test("extracts latency only from tagged benchmark events", () => {
  assert.equal(
    extractBenchmarkLatency({ data: { loadTestId: "event-1" }, latencyMs: 12 }),
    12,
  )
  assert.equal(extractBenchmarkLatency({ type: "connected", timestamp: Date.now() }), null)
  assert.equal(extractBenchmarkLatency({ type: "heartbeat", latencyMs: 4 }), null)
  assert.equal(
    extractBenchmarkLatency({ data: { loadTestId: "event-2" }, latencyMs: -1 }),
    null,
  )
})

test("requires an explicit workspace ID for authenticated benchmark connections", () => {
  assert.equal(requireLoadTestWorkspaceId(" workspace-123 "), "workspace-123")
  assert.throws(() => requireLoadTestWorkspaceId(""), /workspace/i)
  assert.throws(() => requireLoadTestWorkspaceId("   "), /workspace/i)
})

test("passes only when 200 authenticated connections receive every tagged event", () => {
  assert.deepEqual(evaluateBenchmark({
    connected: 200,
    failed: 0,
    testEventCount: 3,
    testEventsReceived: 600,
  }), { passed: true, expectedEvents: 600 })

  assert.deepEqual(evaluateBenchmark({
    connected: 200,
    failed: 1,
    testEventCount: 3,
    testEventsReceived: 600,
  }), { passed: false, expectedEvents: 600 })

  assert.deepEqual(evaluateBenchmark({
    connected: 200,
    failed: 0,
    testEventCount: 3,
    testEventsReceived: 599,
  }), { passed: false, expectedEvents: 600 })
})
