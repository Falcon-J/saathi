import assert from "node:assert/strict"
import test from "node:test"
import { requestGroqStructuredResponse } from "./groq-chat.ts"

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
} as const

test("sends a strict Groq request and parses locally validated output", async () => {
  let requestUrl = ""
  let requestInit: RequestInit | undefined
  const fetchImpl: typeof fetch = async (url, init) => {
    requestUrl = String(url)
    requestInit = init
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: "ready" }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } })
  }

  const result = await requestGroqStructuredResponse({
    apiKey: "test-key",
    model: "test-model",
    name: "test_response",
    schema,
    instructions: "Return the answer.",
    input: "hello",
    parse: (value) => {
      assert.deepEqual(value, { answer: "ready" })
      return value as { answer: string }
    },
    fetchImpl,
  })

  assert.deepEqual(result, { answer: "ready" })
  assert.equal(requestUrl, "https://api.groq.com/openai/v1/chat/completions")
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, "Bearer test-key")

  const body = JSON.parse(String(requestInit?.body))
  assert.equal(body.model, "test-model")
  assert.equal(body.response_format.type, "json_schema")
  assert.equal(body.response_format.json_schema.strict, true)
  assert.deepEqual(body.response_format.json_schema.schema, schema)
  assert.deepEqual(body.messages.map((message: { role: string }) => message.role), ["system", "user"])
})

test("does not call Groq without a server API key", async () => {
  let called = false
  await assert.rejects(() => requestGroqStructuredResponse({
    apiKey: "",
    name: "test_response",
    schema,
    instructions: "Return the answer.",
    input: "hello",
    parse: (value) => value,
    fetchImpl: async () => {
      called = true
      return new Response()
    },
  }), /not configured/i)
  assert.equal(called, false)
})

test("rejects rate limits, refusals, missing output, and invalid JSON", async () => {
  const request = (response: Response) => requestGroqStructuredResponse({
    apiKey: "test-key",
    name: "test_response",
    schema,
    instructions: "Return the answer.",
    input: "hello",
    parse: (value) => value,
    fetchImpl: async () => response,
  })

  await assert.rejects(() => request(new Response("limited", { status: 429 })), /busy/i)
  await assert.rejects(() => request(new Response(JSON.stringify({
    choices: [{ message: { content: null, refusal: "No" } }],
  }), { status: 200 })), /could not understand/i)
  await assert.rejects(() => request(new Response(JSON.stringify({ choices: [] }), { status: 200 })), /valid response/i)
  await assert.rejects(() => request(new Response(JSON.stringify({
    choices: [{ message: { content: "not-json" } }],
  }), { status: 200 })), /valid response/i)
})
