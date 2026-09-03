import assert from "node:assert/strict"
import test from "node:test"
import { parseCsv } from "./csv.ts"

test("parses quoted commas, escaped quotes, and newlines", () => {
  assert.deepEqual(parseCsv([
    "title,description,priority",
    '"Launch flow","Add the ","high"',
    '"Review","Say ""hello"" to the team",medium',
  ].join("\n")), [
    { title: "Launch flow", description: "Add the", priority: "high" },
    { title: "Review", description: 'Say "hello" to the team', priority: "medium" },
  ])
})

test("normalizes time-related CSV headers", () => {
  assert.deepEqual(parseCsv("title,dueAt,estimatedMinutes\nShip it,2026-09-15T14:30:00.000Z,45"), [
    { title: "Ship it", dueat: "2026-09-15T14:30:00.000Z", estimatedminutes: "45" },
  ])
})

test("ignores blank records and removes a UTF-8 BOM from the first header", () => {
  assert.deepEqual(parseCsv("\uFEFFtitle\n\nShip it\n"), [{ title: "Ship it" }])
})

test("rejects malformed CSV", () => {
  assert.throws(() => parseCsv('title,description\n"unfinished'), /unclosed quoted value/)
})
