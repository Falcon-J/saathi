const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")

test("legacy task components do not expose unsupported category fields", () => {
  for (const file of ["app/tasks/actions.ts", "components/task-card.tsx", "components/task-editor.tsx"]) {
    const source = fs.readFileSync(file, "utf8")
    assert.doesNotMatch(source, /categories|assignedTo/)
  }
})
