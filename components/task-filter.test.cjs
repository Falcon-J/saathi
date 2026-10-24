const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const ts = require("typescript")

const jsx = (type, props) => ({ type, props })
const dependencies = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/components/ui/input": { Input: "Input" },
  "@/components/ui/button": { Button: "Button" },
  "lucide-react": { X: "X", Search: "Search" },
}
const moduleExports = {}
const source = ts.transpileModule(fs.readFileSync("components/task-filter.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function("require", "exports", source)(name => {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`)
  return dependencies[name]
}, moduleExports)

const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]

test("Board filters expose accessible controls and forward controlled changes", () => {
  const changes = []
  const tree = moduleExports.TaskFilter({
    searchQuery: "plans", selectedAssignee: null, selectedStatus: "all", selectedPriority: "all",
    members: [{ id: "member-1", email: "member@example.test", username: "A member" }],
    onSearchChange: value => changes.push(["search", value]),
    onFilterByAssignee: value => changes.push(["assignee", value]),
    onFilterByStatus: value => changes.push(["status", value]),
    onFilterByPriority: value => changes.push(["priority", value]),
  })
  const controls = nodes(tree)
  const search = controls.find(node => node.type === "Input" && node.props["aria-label"] === "Search tasks")
  const status = controls.find(node => node.type === "Button" && node.props.children === "active")
  const priority = controls.find(node => node.type === "select" && node.props["aria-label"] === "Task priority filter")
  const assignee = controls.find(node => node.type === "select" && node.props["aria-label"] === "Task assignee filter")
  const clear = controls.find(node => node.type === "button" && node.props["aria-label"] === "Clear task search")

  assert.ok(search && status && priority && assignee && clear)
  assert.equal(search.props.value, "plans")
  assert.equal(controls.find(node => node.type === "Button" && node.props.children === "all").props["aria-pressed"], true)
  search.props.onChange({ target: { value: "release" } })
  status.props.onClick()
  priority.props.onChange({ target: { value: "high" } })
  assignee.props.onChange({ target: { value: "member@example.test" } })
  clear.props.onClick()

  assert.deepEqual(changes, [
    ["search", "release"], ["status", "active"], ["priority", "high"],
    ["assignee", "member@example.test"], ["search", ""],
  ])
})
