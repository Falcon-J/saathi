import assert from "node:assert/strict"
import test from "node:test"
import {
  assertGroqVerificationAction,
  createGroqVerificationRecord,
} from "./groq-verification.ts"

test("creates sanitized Groq verification evidence without provider or user data", () => {
  const record = createGroqVerificationRecord({
    date: "2026-09-02",
    model: "openai/gpt-oss-20b",
    caseName: "complete-task",
    latencyMs: 42.8,
    error: new Error("Bearer secret-key for person@example.com auth-session=cookie"),
  })

  assert.deepEqual(record, {
    date: "2026-09-02",
    model: "openai/gpt-oss-20b",
    case: "complete-task",
    outcome: "unavailable",
    validated: false,
    latencyMs: 43,
  })

  const serialized = JSON.stringify(record)
  assert.doesNotMatch(serialized, /secret-key|person@example\.com|auth-session|Bearer/i)
})

test("classifies successful, rate-limited, invalid, and unconfigured results", () => {
  const base = {
    date: "2026-09-02",
    model: "test-model",
    caseName: "case",
    latencyMs: 1,
  }

  assert.equal(createGroqVerificationRecord({ ...base }).outcome, "success")
  assert.equal(createGroqVerificationRecord({ ...base, error: new Error("busy right now") }).outcome, "rate_limited")
  assert.equal(createGroqVerificationRecord({ ...base, error: new Error("valid response") }).outcome, "invalid_response")
  assert.equal(createGroqVerificationRecord({ ...base, error: new Error("not configured") }).outcome, "not_configured")
})

test("rejects a schema-valid command when Groq selects the wrong action", () => {
  assert.doesNotThrow(() => assertGroqVerificationAction("complete_task", { action: "complete_task" }))
  assert.throws(
    () => assertGroqVerificationAction("complete_task", { action: "add_task" }),
    /expected complete_task/i,
  )
  assert.throws(
    () => assertGroqVerificationAction("unsupported", null),
    /expected unsupported/i,
  )
})
