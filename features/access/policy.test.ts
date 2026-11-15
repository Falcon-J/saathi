import assert from "node:assert/strict"
import test from "node:test"
import { createAccessResolver, resolveEffectiveAccess } from "./policy.ts"
import { MAX_RESOURCE_DEPTH, type AccessGraph, type AccessGrant, type AccessCapability, type AccessActor } from "./contracts.ts"

const now = new Date("2026-11-12T12:00:00Z")
const human: AccessActor = { kind: "user", userId: "member" }
const grant = (resourceId: string, capabilities: AccessCapability[] = ["read"], principal: AccessGrant["principal"] = { kind: "user", id: "member" }): AccessGrant =>
  ({ id: `${resourceId}:${principal.kind}:${principal.id}`, resourceId, principal, capabilities })
const graph = (): AccessGraph => ({ resources: [
  { id: "company", kind: "organization", parentId: null, mode: "restricted" },
  { id: "space", kind: "space", parentId: "company", mode: "inherit" },
  { id: "section", kind: "section", parentId: "space", mode: "inherit" },
  { id: "work", kind: "workspace", parentId: "section", mode: "inherit" },
], grants: [], memberships: [], references: [] })
const access = (resourceId: string, value: AccessGraph, actor: AccessActor = human) => resolveEffectiveAccess(resourceId, actor, value, now)

test("company membership and canvas references alone grant no resource capabilities", () => {
  const value = graph()
  value.memberships.push({ organizationId: "company", userId: "member", groupId: "everyone" })
  value.references.push({ id: "ref", canvasResourceId: "space", targetResourceId: "work" })
  assert.deepEqual(access("work", value).capabilities, [])
  assert.equal(access("work", value).allowed, false)
})

test("inherited read-only access remains read-only until an explicit editable grant", () => {
  const value = graph()
  value.grants.push(grant("company"))
  assert.deepEqual(access("work", value).capabilities, ["read"])
  value.grants.push(grant("section", ["read", "edit", "comment"]))
  assert.deepEqual(access("work", value).capabilities, ["read", "edit", "comment"])
  assert.deepEqual(access("space", value).capabilities, ["read"])
})

test("a restricted boundary resets all ancestor capabilities including owner manage", () => {
  const value = graph()
  value.grants.push(grant("company", ["read", "create", "edit", "comment", "manage", "delete"]))
  value.resources[2].mode = "restricted"
  assert.equal(access("company", value).capabilities.includes("manage"), true)
  assert.equal(access("section", value).allowed, false)
  assert.equal(access("work", value).allowed, false)
  value.grants.push(grant("section"))
  assert.deepEqual(access("work", value).capabilities, ["read"])
})

test("an explicit contained-resource grant grants its inheriting subtree without revealing ancestors", () => {
  const value = graph()
  value.resources[2].mode = "restricted"
  value.grants.push(grant("section", ["read", "edit"]))
  assert.equal(access("company", value).allowed, false)
  assert.equal(access("space", value).allowed, false)
  assert.deepEqual(access("work", value).capabilities, ["read", "edit"])
  value.resources[3].mode = "restricted"
  assert.equal(access("work", value).allowed, false)
})

test("manage and delete are explicit capabilities without edit or unrestricted-child bypass", () => {
  const value = graph()
  value.grants.push(grant("space", ["read", "manage", "delete"]))
  assert.deepEqual(access("space", value).capabilities, ["read", "manage", "delete"])
  assert.equal(access("space", value).capabilities.includes("edit"), false)
})

test("group grants use active server-supplied memberships in the canonical organization", () => {
  const value = graph()
  value.grants.push(grant("section", ["read", "edit"], { kind: "group", id: "engineering" }))
  value.memberships.push({ organizationId: "elsewhere", userId: "member", groupId: "engineering" })
  assert.equal(access("work", value).allowed, false)
  value.memberships[0].organizationId = "company"
  assert.equal(access("work", value).capabilities.includes("edit"), true)
  value.memberships[0].revokedAt = "2026-11-12T11:00:00Z"
  assert.equal(access("work", value).allowed, false)
})

test("revoked and expired grants cannot contribute even when another read grant remains", () => {
  const value = graph()
  value.grants.push(grant("company"), { ...grant("work", ["read", "edit"]), expiresAt: now.toISOString() })
  assert.deepEqual(access("work", value).capabilities, ["read"])
  value.grants[1].expiresAt = "2026-11-13T00:00:00Z"
  assert.equal(access("work", value).capabilities.includes("edit"), true)
  value.grants[1].revokedAt = "2026-11-12T11:00:00Z"
  assert.deepEqual(access("work", value).capabilities, ["read"])
})

test("malformed grants, duplicate IDs and write grants without read fail closed", () => {
  const value = graph()
  value.grants.push(grant("company", ["read", "edit"]))
  for (const malformed of [
    { ...grant("work"), capabilities: ["edit"] },
    { ...grant("work"), capabilities: ["read", "read"] },
    { ...grant("work"), expiresAt: "not-a-date" },
    { ...grant("work"), principal: { kind: "group", id: "" } },
    { ...grant("work"), resourceId: "missing" },
    { ...grant("work"), unexpected: true },
  ]) assert.equal(access("work", { ...value, grants: [...value.grants, malformed] } as AccessGraph).allowed, false)
  assert.equal(access("work", { ...value, grants: [value.grants[0], value.grants[0]] }).allowed, false)
})

test("missing parent, cycles, invalid hierarchy and duplicate resources deny access", () => {
  const value = graph()
  value.grants.push(grant("company", ["read", "edit"]))
  assert.equal(access("missing", value).allowed, false)
  for (const resources of [
    value.resources.filter(resource => resource.id !== "section"),
    value.resources.map(resource => resource.id === "section" ? { ...resource, parentId: "work" } : resource),
    value.resources.map(resource => resource.id === "work" ? { ...resource, parentId: "company" } : resource),
    [...value.resources, value.resources[3]],
  ]) assert.equal(access("work", { ...value, resources }).allowed, false)
})

test("bounded section nesting permits the supported depth and rejects one more level", () => {
  const value = graph()
  value.resources = value.resources.slice(0, 2)
  let parent = "space"
  for (let depth = 2; depth <= MAX_RESOURCE_DEPTH; depth++) {
    const id = `section-${depth}`
    value.resources.push({ id, kind: "section", parentId: parent, mode: "inherit" })
    parent = id
  }
  value.grants.push(grant("company"))
  assert.equal(access(parent, value).allowed, true)
  value.resources.push({ id: "too-deep", kind: "section", parentId: parent, mode: "inherit" })
  assert.equal(access("too-deep", value).allowed, false)
})

test("ordering and resolution do not mutate policy facts or change effective capabilities", () => {
  const value = graph()
  value.grants.push(grant("company"), grant("section", ["read", "comment", "edit"]))
  const before = JSON.stringify(value)
  const decision = access("work", value)
  assert.deepEqual(access("work", { ...value, resources: [...value.resources].reverse(), grants: [...value.grants].reverse() }), decision)
  assert.equal(JSON.stringify(value), before)
})

test("invalid identities and clocks deny rather than broadening permission", () => {
  const value = graph(); value.grants.push(grant("company"))
  assert.equal(access("work", value, { kind: "user", userId: "" }).allowed, false)
  assert.equal(resolveEffectiveAccess("work", human, value, new Date("invalid")).allowed, false)
})

test("a compiled batch isolates both policy facts and clock from later caller mutation", () => {
  const value = graph(); value.grants.push({ ...grant("company"), expiresAt: "2026-11-12T13:00:00Z" })
  const clock = new Date(now)
  const resolve = createAccessResolver(value, clock)
  value.grants[0].capabilities.push("edit")
  clock.setUTCFullYear(2030)
  assert.deepEqual(resolve("work", human).capabilities, ["read"])
  assert.equal(resolve("work", { kind: "user", userId: "different" }).allowed, false)
})
