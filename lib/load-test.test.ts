import assert from "node:assert/strict"
import test from "node:test"
import {
  extractBenchmarkLatency,
  isLoadTestSecretValid,
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
