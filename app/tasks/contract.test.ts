import assert from "node:assert/strict"
import test from "node:test"
import { hasTaskConflict, normalizeTaskUpdates } from "./contract.ts"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

test("task actions preserve stable public errors and hide unexpected database details", async () => {
  class TaskError extends Error { code: string; constructor(message: string, code="unavailable") { super(message); this.code=code } }
  class RateLimitExceeded extends Error { retryAfterSeconds=10 }
  let session: {id: string} | null = null
  let failure: Error | undefined
  const dependencies: Record<string, unknown> = {
    "@/lib/post-commit": { afterDomainCommit: () => {} },
    "@/lib/auth-simple": { getSession: async () => session },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/data/tasks": { TaskError, changeTaskRecord: async () => { if(failure) throw failure; return {id:"task",version:2} } },
    "@/lib/rate-limit": { RateLimitExceeded, consumeDistributedRateLimit: async () => {} },
    "@/lib/env": { getRateLimits: () => ({tasks:{maxRequests:10,windowMs:1000}}) },
  }
  const exports: {updateTask?: (...args: unknown[])=>Promise<{error?:string;code?:string;success?:boolean;retryAfterSeconds?:number}>} = {}
  const js=ts.transpileModule(readFileSync(new URL("./actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  const require=createRequire(import.meta.url)
  new Function("require","exports",js)((name:string)=>dependencies[name] ?? require(name),exports)
  const update=exports.updateTask!
  assert.equal((await update("task",{title:"Edit"},1)).code,"unauthenticated")
  session={id:"actor"}
  for(const code of ["validation","forbidden","not_found","conflict"]) {
    failure=new TaskError("Safe message",code)
    assert.deepEqual(await update("task",{title:"Edit"},1),{error:"Safe message",code})
  }
  failure=new Error("sensitive database details")
  assert.deepEqual(await update("task",{title:"Edit"},1),{error:"Unable to confirm the task was saved. Refresh before retrying.",code:"unavailable",unknownOutcome:true})
  failure=new RateLimitExceeded("Slow down")
  assert.deepEqual(await update("task",{title:"Edit"},1),{error:"Slow down",code:"rate_limited",retryAfterSeconds:10})
  failure=undefined
  assert.deepEqual(await update("task",{title:"Edit"},1),{success:true,task:{id:"task",version:2}})
})

test("normalizes allowed task updates", () => {
  assert.deepEqual(normalizeTaskUpdates({ title: "  Launch flow  ", priority: "high", status: "in-progress" }), {
    updates: { title: "Launch flow", priority: "high", status: "in-progress" },
  })
})

test("accepts the persisted board status values", () => {
  assert.deepEqual(normalizeTaskUpdates({ status: "done" }), {
    updates: { status: "done" },
  })
})

test("accepts execution metadata used by the overview", () => {
  assert.deepEqual(normalizeTaskUpdates({ bucket: "next", estimatedMinutes: 45 }), {
    updates: { bucket: "next", estimatedMinutes: 45 },
  })
})

test("accepts an ISO due time and preserves an estimate", () => {
  assert.deepEqual(normalizeTaskUpdates({ dueAt: "2026-09-15T14:30:00.000Z", estimatedMinutes: 45 }), {
    updates: { dueAt: "2026-09-15T14:30:00.000Z", estimatedMinutes: 45 },
  })
})

test("rejects a task update that supplies both a due date and due time", () => {
  assert.equal(normalizeTaskUpdates({
    dueDate: "2026-09-15",
    dueAt: "2026-09-15T14:30:00.000Z",
  }).error, "Use either a due date or due time")
})

test("rejects an invalid due time", () => {
  assert.equal(typeof normalizeTaskUpdates({ dueAt: "tomorrow afternoon" }).error, "string")
})

test("rejects invalid execution metadata", () => {
  assert.equal(typeof normalizeTaskUpdates({ bucket: "later" }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({ estimatedMinutes: 0 }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({ estimatedMinutes: 1441 }).error, "string")
})

test("rejects server-owned task fields", () => {
  const result = normalizeTaskUpdates({ workspaceId: "other-workspace" })
  assert.equal(typeof result.error, "string")
})

test("accepts clearing an assignee", () => {
  assert.deepEqual(normalizeTaskUpdates({ assigneeEmail: null }), {
    updates: { assigneeEmail: undefined },
  })
  assert.deepEqual(normalizeTaskUpdates({ assigneeEmail: undefined }), {
    updates: { assigneeEmail: undefined },
  })
})

test("rejects invalid task input and empty updates", () => {
  assert.equal(typeof normalizeTaskUpdates({ assigneeEmail: "not-an-email" }).error, "string")
  assert.equal(typeof normalizeTaskUpdates({}).error, "string")
})

test("detects a stale task version without requiring a precondition for legacy callers", () => {
  assert.equal(hasTaskConflict("v2", "v1"), true)
  assert.equal(hasTaskConflict("v1", "v1"), false)
  assert.equal(hasTaskConflict("v1"), false)
})
