import assert from "node:assert/strict"
import test from "node:test"
import { parseCanvasSearch, scopeWorkspaceIds } from "./search.ts"
test("search bounds input and treats wildcards as literal text", () => {
  assert.deepEqual(parseCanvasSearch({ query: "  %_  " }), { query: "%_" })
  for (const value of [{ query: "a" }, { query: "x".repeat(121) }, { query: "ok", resourceId: "forged" }]) assert.throws(() => parseCanvasSearch(value))
})
test("resource searches use only currently authorized canonical descendants", () => {
  const resources = [{ id: "company", parentId: null }, { id: "section", parentId: "company" }, { id: "a", parentId: "section", workspaceId: "w" }, { id: "b", parentId: null, workspaceId: "other" }]
  assert.deepEqual(scopeWorkspaceIds("section", resources, ["w", "other"]), ["w"])
  assert.deepEqual(scopeWorkspaceIds("section", resources, ["other"]), [])
  assert.deepEqual(scopeWorkspaceIds("revoked", resources, ["w"]), [])
  assert.deepEqual(scopeWorkspaceIds(undefined, resources, ["w","other"]), ["w","other"])
})
