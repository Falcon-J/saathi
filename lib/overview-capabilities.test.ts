import assert from "node:assert/strict"
import test from "node:test"
import { overviewCapabilities } from "./overview-capabilities.ts"

test("keeps quick execution in Overview and detailed task management in Board", () => {
  assert.deepEqual(overviewCapabilities.overview, ["quick-add", "complete", "reopen"])
  assert.deepEqual(overviewCapabilities.board, [
    "edit",
    "delete",
    "assign",
    "priority",
    "due-date",
    "status",
    "search",
    "csv-import",
  ])
})
