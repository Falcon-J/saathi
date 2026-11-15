import assert from "node:assert/strict"
import { test } from "node:test"
import { createPlatformExecutor } from "./executor.ts"

const userId = "11111111-1111-4111-8111-111111111111"
const workspaceId = "22222222-2222-4222-8222-222222222222"
const taskId = "33333333-3333-4333-8333-333333333333"
const commandId = "44444444-4444-4444-8444-444444444444"
const principal = { userId, clientId: "client-a", grantId: "55555555-5555-4555-8555-555555555555", capabilities: ["tasks:read", "tasks:write"], workspaceIds: [workspaceId] }

test("discovery exposes only installed handlers allowed by the current delegation", () => {
  const executor = createPlatformExecutor({ handlers: { "tasks.get": async () => ({ data: {} }), "tasks.set_status": async () => ({ data: {} }) }, revalidate: async () => {}, executeWithReceipt: async () => { throw new Error("not used") } })
  assert.deepEqual(executor.listTools({ ...principal, capabilities: ["tasks:read"] }).map(tool => tool.name), ["tasks.get"])
  assert.deepEqual(executor.listTools({ ...principal, capabilities: [] }), [])
})

test("untrusted actors and malformed commands cannot reach a domain handler", async () => {
  let calls = 0
  const executor = createPlatformExecutor({ handlers: { "tasks.set_status": async () => { calls++; return { data: {} } } }, revalidate: async () => {}, executeWithReceipt: async () => { throw new Error("not used") } })
  const result = await executor.call(principal, "tasks.set_status", { workspaceId, taskId, commandId, expectedVersion: 1, status: "done", userId })
  assert.equal(result.state, "rejected")
  assert.equal(result.error.code, "invalid_input")
  assert.equal(calls, 0)
})

test("a valid capability cannot access a workspace outside its delegation", async () => {
  let calls = 0
  const executor = createPlatformExecutor({ handlers: { "tasks.get": async () => { calls++; return { data: {} } } }, revalidate: async () => {}, executeWithReceipt: async () => { throw new Error("not used") } })
  const result = await executor.call({ ...principal, workspaceIds: [] }, "tasks.get", { workspaceId, taskId })
  assert.equal(result.state, "error")
  assert.equal(result.error.code, "forbidden")
  assert.equal(calls, 0)
})

test("current revocation is checked before reading authorized domain data", async () => {
  let calls = 0
  const executor = createPlatformExecutor({ handlers: { "tasks.get": async () => { calls++; return { data: {} } } }, revalidate: async () => { throw Object.assign(new Error("private grant details"), { code: "forbidden" }) }, executeWithReceipt: async () => { throw new Error("not used") } })
  const result = await executor.call(principal, "tasks.get", { workspaceId, taskId })
  assert.equal(result.state, "error")
  assert.equal(result.error.code, "forbidden")
  assert.equal(JSON.stringify(result).includes("private grant details"), false)
  assert.equal(calls, 0)
})

test("writes authorize inside the receipt transaction and only return its durable outcome", async () => {
  const phases: string[] = []
  const task = { id: taskId, workspaceId, title: "Ship", description: "", status: "done", priority: "medium", assigneeUserId: null, dueDate: null, dueAt: null, estimatedMinutes: null, version: 2 }
  const executor = createPlatformExecutor({ handlers: { "tasks.set_status": async () => { phases.push("domain"); return { data: task, version: 2 } } }, revalidate: async () => { phases.push("authorize") }, executeWithReceipt: async args => { phases.push("transaction"); await args.authorize(); const result = await args.execute(); phases.push("commit"); return { result, replayed: false } } })
  const result = await executor.call(principal, "tasks.set_status", { workspaceId, taskId, commandId, expectedVersion: 1, status: "done" })
  assert.equal(result.state, "committed")
  assert.equal(result.version, 2)
  assert.equal(result.replayed, false)
  assert.deepEqual(phases, ["transaction", "authorize", "domain", "commit"])
})

test("historic command outcomes are explicitly marked as replayed", async () => {
  const executor = createPlatformExecutor({ handlers: { "tasks.delete": async () => ({ data: { id: taskId } }) }, revalidate: async () => {}, executeWithReceipt: async args => ({ result: await args.execute(), replayed: true }) })
  const result = await executor.call({ ...principal, capabilities: ["tasks:delete"] }, "tasks.delete", { workspaceId, taskId, commandId, expectedVersion: 1 })
  assert.equal(result.state, "committed")
  assert.equal(result.replayed, true)
})

test("unexpected mutation failure is unconfirmed and does not expose internal diagnostics", async () => {
  const executor = createPlatformExecutor({ handlers: { "tasks.set_status": async () => ({ data: {} }) }, revalidate: async () => {}, executeWithReceipt: async () => { throw new Error("secret database connection") } })
  const result = await executor.call(principal, "tasks.set_status", { workspaceId, taskId, commandId, expectedVersion: 1, status: "done" })
  assert.equal(result.state, "unconfirmed")
  assert.equal(JSON.stringify(result).includes("secret database"), false)
})

test("unscoped reads use the fresh delegation rather than the request's earlier workspace allowance", async () => {
  const executor = createPlatformExecutor({ handlers: { "workspaces.list": async ({ principal: current }) => ({ data: { items: [], nextCursor: null }, observed: assert.deepEqual(current.workspaceIds, []) }) }, revalidate: async current => ({ ...current, workspaceIds: [] }), executeWithReceipt: async () => { throw new Error("not used") } })
  const result = await executor.call({ ...principal, capabilities: ["workspaces:read"], workspaceIds: null }, "workspaces.list", {})
  assert.equal(result.state, "ok")
})

test("a delegation narrowed while a command waits rejects before mutation", async () => {
  let calls = 0
  const executor = createPlatformExecutor({ handlers: { "tasks.set_status": async () => { calls++; return { data: {} } } }, revalidate: async current => ({ ...current, workspaceIds: [] }), executeWithReceipt: async args => { await args.authorize(); return { result: await args.execute(), replayed: false } } })
  const result = await executor.call(principal, "tasks.set_status", { workspaceId, taskId, commandId, expectedVersion: 1, status: "done" })
  assert.equal(result.state, "rejected")
  assert.equal(calls, 0)
})
test('public command IDs remain unchanged while domain dispatch is isolated across clients',async()=>{
 const internal:string[]=[]
 const task={id:taskId,workspaceId,title:'Created',description:'',status:'todo',priority:'medium',assigneeUserId:null,dueDate:null,dueAt:null,estimatedMinutes:null,version:1}
 const executor=createPlatformExecutor({handlers:{'tasks.create':async({input})=>{internal.push(String(input.commandId));return {data:task,version:1}}},revalidate:async()=>{},executeWithReceipt:async args=>{assert.equal(args.commandId,commandId);assert.equal((args.input as {commandId:string}).commandId,commandId);await args.authorize();return {result:await args.execute(),replayed:false}}})
 const input={workspaceId,commandId,expectedVersion:null,title:'Created'}
 for(const clientId of ['client-a','client-b','client-a']){
  const result=await executor.call({...principal,clientId},'tasks.create',input)
  assert.equal(result.state,'committed');if(result.state==='committed')assert.equal(result.commandId,commandId)
 }
 assert.notEqual(internal[0],commandId);assert.notEqual(internal[0],internal[1]);assert.equal(internal[0],internal[2])
})
