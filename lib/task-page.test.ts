import assert from "node:assert/strict"
import test from "node:test"
import { normalizeTaskPage, encodeTaskCursor, decodeTaskCursor } from "./task-page.ts"
const workspace = "00000000-0000-4000-8000-000000000001"
const boundary = "00000000-0000-4000-8000-000000000002"
test("task page normalizes scope and bounds requests", () => {
  assert.deepEqual(normalizeTaskPage({search:"  Plan ",assigneeEmail:" MEMBER@example.test "}), {search:"plan",status:"all",priority:null,assigneeEmail:"member@example.test",limit:50})
  for (const input of [{limit:101},{limit:0},{limit:1.5},{status:"todo"},{search:"x".repeat(201)},{assigneeEmail:"bad"},{cursor:""}]) assert.throws(() => normalizeTaskPage(input))
})
test("cursor binds workspace, filters and ordering and validates its shape", () => {
  const scope = normalizeTaskPage({status:"active"})
  const cursor = encodeTaskCursor(workspace,scope,boundary)
  assert.equal(decodeTaskCursor(cursor,workspace,scope), boundary)
  assert.throws(() => decodeTaskCursor(cursor,boundary,scope))
  assert.throws(() => decodeTaskCursor(cursor,workspace,normalizeTaskPage({status:"completed"})))
  for(const value of ["bad", Buffer.from('{}').toString('base64url'),cursor+'!']) assert.throws(() => decodeTaskCursor(value,workspace,scope))
  assert.equal(decodeTaskCursor(cursor,workspace,normalizeTaskPage({status:"active",limit:100})),boundary)
})
