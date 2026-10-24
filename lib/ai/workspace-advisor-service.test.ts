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
    answer: "1 task: 0 completed, 1 open. 1 overdue, 0 without deadlines, 0 due today, 0 upcoming.",
    attention: [],
    draft: null,
  }

  const result = await requestWorkspaceAdvisor({
    capability: "summarize_workspace",
    question: "What should we focus on?",
    projection,
    request: async options => {
      received = options
      return options.parse({ ...expected, attention: [] })
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
    deadlineFacts: [{ taskId: "task-1", deadlineState: "overdue" }],
    counts: { total: 1, completed: 0, open: 1, overdue: 1, noDeadline: 0, dueToday: 0, upcoming: 0 },
  })
})

test("rejects invalid advisor inputs before calling the provider", async () => {
  let called = false

  await assert.rejects(() => requestWorkspaceAdvisor({
    capability: "draft_task",
    question: " ",
    projection,
    request: async ({ parse }) => {
      called = true
      return parse({})
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
      attention: [{ taskId: "other-workspace-task", reasonCode: "overdue" }],
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
        { taskId: "task-1", reasonCode: "overdue" },
        { taskId: " task-1 ", reasonCode: "high_priority" },
      ],
      draft: null,
    }),
  }), (error: unknown) => error instanceof AdvisorResponseError && /task reference/i.test(error.message))
})

test("accepts unique attention references from the authorized projection", async () => {
  const expected: AdvisorResponse = {
    capability: "identify_attention",
    answer: "Ship the release task next.",
    attention: [{ taskId: "task-1", reason: "Ship: High priority" }],
    draft: null,
  }
  const result = await requestWorkspaceAdvisor({
    capability: "identify_attention",
    question: "Which tasks need attention?",
    projection,
    request: async ({ parse }) => parse({ ...expected, attention: [{ taskId: "task-1", reasonCode: "high_priority" }] }),
  })
  assert.deepEqual(result, expected)
})

test("a past workspace goal cannot turn two undated tasks into overdue tasks", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T12:00:00Z") })
  const mixed: AdvisorProjection = {
    workspace: { name: "Launch", summary: "All work was due by September 1", timezone: "UTC" },
    tasks: Array.from({ length: 5 }, (_, index) => ({
      ...projection.tasks[0], id: `task-${index}`, dueDate: index < 3 ? "2026-09-01" : null,
    })),
  }
  let calls = 0
  const result = await requestWorkspaceAdvisor({
    capability: "summarize_workspace", question: "Summarize", projection: mixed,
    request: async ({ parse, input }) => {
      calls++
      assert.deepEqual(JSON.parse(input).counts, { total: 5, completed: 0, open: 5, overdue: 3, noDeadline: 2, dueToday: 0, upcoming: 0 })
      return parse({ capability: "summarize_workspace", answer: "All five tasks are overdue.", attention: [], draft: null })
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.answer, "5 tasks: 0 completed, 5 open. 3 overdue, 2 without deadlines, 0 due today, 0 upcoming.")
  assert.deepEqual(Object.keys(result).sort(), ["answer", "attention", "capability", "draft"])
})

test("deadline facts respect workspace calendar boundaries and precise instant equality", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T00:30:00.000Z") })
  const dates: AdvisorProjection = {
    workspace: { name: "Boundary", timezone: "America/Los_Angeles" },
    tasks: [
      { ...projection.tasks[0], id: "today", dueDate: "2026-10-24" },
      { ...projection.tasks[0], id: "tomorrow", dueDate: "2026-10-25" },
      { ...projection.tasks[0], id: "instant-past", dueDate: null, dueAt: "2026-10-25T00:29:59.999Z" },
      { ...projection.tasks[0], id: "instant-now", dueDate: null, dueAt: "2026-10-25T00:30:00.000Z" },
      { ...projection.tasks[0], id: "completed", status: "done" },
    ],
  }
  await requestWorkspaceAdvisor({
    capability: "summarize_workspace", question: "Summarize", projection: dates,
    request: async ({ parse, input }) => {
      const facts = JSON.parse(input)
      assert.equal(facts.currentDate, "2026-10-24")
      assert.deepEqual(facts.deadlineFacts, [
        { taskId: "today", deadlineState: "due_today" }, { taskId: "tomorrow", deadlineState: "upcoming" },
        { taskId: "instant-past", deadlineState: "overdue" }, { taskId: "instant-now", deadlineState: "due_today" },
        { taskId: "completed", deadlineState: "completed" },
      ])
      assert.deepEqual(facts.counts, { total: 5, completed: 1, open: 4, overdue: 1, noDeadline: 0, dueToday: 2, upcoming: 1 })
      return parse({ capability: "summarize_workspace", answer: "Summary", attention: [], draft: null })
    },
  })
})

for (const task of [
  { ...projection.tasks[0], id: "undated", dueDate: null },
  { ...projection.tasks[0], id: "completed", status: "done" as const },
]) {
  test(`rejects an overdue reason for an ${task.id} task`, async () => {
    await assert.rejects(requestWorkspaceAdvisor({
      capability: "identify_attention", question: "What is overdue?", projection: { ...projection, tasks: [task] },
      request: async ({ parse }) => parse({ capability: "identify_attention", answer: "Overdue", attention: [{ taskId: task.id, reasonCode: "overdue" }], draft: null }),
    }), (error: unknown) => error instanceof AdvisorResponseError && /reason/i.test(error.message))
  })
}

test("provider attention accepts only bounded reason codes and preserves draft validation", async () => {
  for (const response of [
    { capability: "identify_attention", answer: "Review", attention: [{ taskId: "task-1", reasonCode: "workspace_goal_overdue" }], draft: null },
    { capability: "draft_task", answer: "Draft", attention: [], draft: null },
  ]) {
    await assert.rejects(requestWorkspaceAdvisor({
      capability: response.capability as AdvisorResponse["capability"], question: "Review", projection,
      request: async ({ parse }) => parse(response),
    }), /response is invalid/)
  }
})

test("valid attention codes map to public reasons without exposing provider fields", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T12:00:00Z") })
  const tasks: AdvisorProjection["tasks"] = [
    { ...projection.tasks[0], id: "overdue" },
    { ...projection.tasks[0], id: "undated", dueDate: null },
    { ...projection.tasks[0], id: "today", dueDate: "2026-10-25" },
    { ...projection.tasks[0], id: "future", dueDate: "2026-10-26" },
    { ...projection.tasks[0], id: "progress", status: "in-progress", dueDate: null },
  ]
  const result = await requestWorkspaceAdvisor({
    capability: "identify_attention", question: "Review", projection: { workspace: { name: "Launch", timezone: "UTC" }, tasks },
    request: async ({ parse }) => parse({
      capability: "identify_attention", answer: "Review these tasks", draft: null,
      attention: [
        { taskId: "overdue", reasonCode: "overdue" }, { taskId: "undated", reasonCode: "no_deadline" },
        { taskId: "today", reasonCode: "due_today" }, { taskId: "future", reasonCode: "upcoming" },
        { taskId: "progress", reasonCode: "in_progress" },
      ],
    }),
  })
  assert.deepEqual(result.attention, [
    { taskId: "overdue", reason: "Ship: Past its deadline" }, { taskId: "undated", reason: "Ship: No deadline" },
    { taskId: "today", reason: "Ship: Due today" }, { taskId: "future", reason: "Ship: Upcoming deadline" },
    { taskId: "progress", reason: "Ship: Work in progress" },
  ])
})

test("deadline reason codes cannot substitute another task's facts", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T12:00:00Z") })
  for (const reasonCode of ["overdue", "no_deadline", "high_priority", "in_progress", "due_today"]) {
    await assert.rejects(requestWorkspaceAdvisor({
      capability: "identify_attention", question: "Review",
      projection: { ...projection, tasks: [{ ...projection.tasks[0], priority: "low", dueDate: "2026-10-28" }] },
      request: async ({ parse }) => parse({ capability: "identify_attention", answer: "Review", draft: null, attention: [{ taskId: "task-1", reasonCode }] }),
    }), (error: unknown) => error instanceof AdvisorResponseError && /reason/i.test(error.message))
  }
})
