import assert from "node:assert/strict"
import test from "node:test"
import type { AdvisorProjection, AdvisorResponse } from "./workspace-advisor.ts"
import { AdvisorResponseError, requestWorkspaceAdvisor } from "./workspace-advisor-service.ts"

const projection: AdvisorProjection = {
  workspace: { name: "Launch", summary: "Ship the first release", timezone: "Asia/Kolkata" },
  tasks: [{
    id: "task-1",
    title: "Ship",
    description: "Release the build",
    status: "todo",
    priority: "high",
    dueDate: "2026-09-07",
    dueAt: null,
  }],
}

test("requests grounded advice with the authorized projection and server time in the workspace timezone", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-22T23:30:00.000Z") })
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
  assert.match(received?.instructions ?? "", /past deadline is overdue, never upcoming or imminent/i)
  assert.match(received?.instructions ?? "", /Completed tasks are not overdue.*Undated tasks have no deadline/)
  assert.deepEqual(JSON.parse(received?.input ?? ""), {
    question: "What should we focus on?",
    currentTime: "2026-10-22T23:30:00.000Z",
    currentDate: "2026-10-23",
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

test("rejects a provider response for a different capability", async () => {
  await assert.rejects(() => requestWorkspaceAdvisor({
    capability: "summarize_workspace",
    question: "Summarize this workspace",
    projection,
    request: async ({ parse }) => parse({
      capability: "identify_attention",
      answer: "Ship the release task next.",
      attention: [],
      draft: null,
    }),
  }), (error: unknown) => error instanceof AdvisorResponseError && /capability/i.test(error.message))
})

test("rejects attention references outside the authorized projection", async () => {
  await assert.rejects(() => requestWorkspaceAdvisor({
    capability: "identify_attention",
    question: "Which tasks need attention?",
    projection,
    request: async ({ parse }) => parse({
      capability: "identify_attention",
      answer: "Review the task.",
      attention: [{ taskId: "other-workspace-task", reason: "Release is due" }],
      draft: null,
    }),
  }), (error: unknown) => error instanceof AdvisorResponseError && /task reference/i.test(error.message))
})

test("rejects duplicate attention references after trimming task IDs", async () => {
  await assert.rejects(() => requestWorkspaceAdvisor({
    capability: "identify_attention",
    question: "Which tasks need attention?",
    projection,
    request: async ({ parse }) => parse({
      capability: "identify_attention",
      answer: "Ship the release task next.",
      attention: [
        { taskId: "task-1", reason: "Release is due" },
        { taskId: " task-1 ", reason: "Release is important" },
      ],
      draft: null,
    }),
  }), (error: unknown) => error instanceof AdvisorResponseError && /task reference/i.test(error.message))
})

test("accepts unique attention references from the authorized projection", async () => {
  const expected: AdvisorResponse = {
    capability: "identify_attention",
    answer: "Ship the release task next.",
    attention: [{ taskId: "task-1", reason: "Release is important" }],
    draft: null,
  }
  const result = await requestWorkspaceAdvisor({
    capability: "identify_attention",
    question: "Which tasks need attention?",
    projection,
    request: async ({ parse }) => parse(expected),
  })
  assert.deepEqual(result, expected)
})
