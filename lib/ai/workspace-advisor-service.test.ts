import assert from "node:assert/strict"
import test from "node:test"
import type { AdvisorProjection, AdvisorResponse } from "./workspace-advisor.ts"
import { requestWorkspaceAdvisor } from "./workspace-advisor-service.ts"

const projection: AdvisorProjection = {
  workspace: { name: "Launch", summary: "Ship the first release" },
  tasks: [{
    id: "task-1",
    title: "Ship",
    description: "Release the build",
    status: "todo",
    priority: "high",
    dueDate: null,
    dueAt: null,
    assigneeEmail: "member@example.com",
  }],
}

test("requests grounded advice with only the authorized projection", async () => {
  let received: { name: string; input: string; instructions: string } | undefined
  const expected: AdvisorResponse = {
    capability: "summarize_workspace",
    answer: "Ship the release task next.",
    attention: [],
    draft: null,
  }

  const result = await requestWorkspaceAdvisor({
    capability: "summarize_workspace",
    question: "What should we focus on?",
    projection,
    request: async options => {
      received = options
      return expected
    },
  })

  assert.deepEqual(result, expected)
  assert.equal(received?.name, "saathi_workspace_advisor")
  assert.match(received?.instructions ?? "", /do not make changes/i)
  assert.deepEqual(JSON.parse(received?.input ?? ""), {
    question: "What should we focus on?",
    workspace: projection,
  })
})

test("rejects invalid advisor inputs before calling the provider", async () => {
  let called = false

  await assert.rejects(() => requestWorkspaceAdvisor({
    capability: "draft_task",
    question: " ",
    projection,
    request: async () => {
      called = true
      return {} as AdvisorResponse
    },
  }), /question/i)

  assert.equal(called, false)
})
