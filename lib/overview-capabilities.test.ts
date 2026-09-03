import assert from "node:assert/strict"
import test from "node:test"
import { overviewCapabilities } from "./overview-capabilities.ts"

test("keeps core task management available in Overview and Board", () => {
  assert.deepEqual(overviewCapabilities.overview, ["quick-add", "complete", "reopen", "edit", "delete"])
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
