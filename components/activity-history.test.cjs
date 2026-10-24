const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const ts = require("typescript")

const tick = () => new Promise(resolve => setImmediate(resolve))
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function fixture(readActivity) {
  const slots = []
  let cursor = 0
  const effects = []
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value }]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { current: initial }
      return slots[index]
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }
      return slots[index].callback
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) {
        slots[index]?.cleanup?.()
        slots[index] = { deps }
        effects.push(() => { slots[index].cleanup = effect() })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const source = fs.readFileSync("components/activity-history.tsx", "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const dependencies = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": { Activity: "Activity", RefreshCw: "RefreshCw" },
    "@/app/actions/activity": { getWorkspaceActivity: readActivity },
    "@/components/ui/button": { Button: "Button" },
  }
  new Function("require", "exports", compiled)(name => dependencies[name], exports)
  return {
    render(workspaceId, refreshSignal) {
      cursor = 0
      const tree = exports.ActivityHistory({ workspaceId, refreshSignal })
      const pending = effects.splice(0)
      pending.forEach(effect => effect())
      return tree
    },
  }
}

const event = id => ({ id, actorUsername: id, actorEmail: `${id}@example.test`, eventType: "task-created", metadata: {}, createdAt: "2026-10-06T10:00:00.000Z" })

test("Activity ignores an old workspace response after the selected workspace changes", async () => {
  const oldRead = deferred()
  const currentRead = deferred()
  const ui = fixture(workspaceId => workspaceId === "old" ? oldRead.promise : currentRead.promise)
  ui.render("old")
  ui.render("current")

  oldRead.resolve({ events: [event("old-event")] })
  await tick()
  assert.doesNotMatch(JSON.stringify(ui.render("current")), /old-event/)

  currentRead.resolve({ events: [event("current-event")] })
  await tick()
  assert.match(JSON.stringify(ui.render("current")), /current-event/)
})

test("Activity hides already-loaded events on the first render after a workspace switch", async () => {
  const currentRead = deferred()
  const ui = fixture(workspaceId => workspaceId === "old" ? Promise.resolve({ events: [event("old-event")] }) : currentRead.promise)
  ui.render("old")
  await tick()
  assert.match(JSON.stringify(ui.render("old")), /old-event/)

  assert.doesNotMatch(JSON.stringify(ui.render("current")), /old-event/)
})

test("Activity distinguishes loading, retryable read failure, and an empty record", async () => {
  let reads = 0
  const ui = fixture(() => ++reads === 1 ? Promise.reject(new Error("private backend detail")) : Promise.resolve({ events: [] }))

  ui.render("workspace")
  assert.match(JSON.stringify(ui.render("workspace")), /Loading activity/)
  await tick()
  let tree = ui.render("workspace")
  assert.match(JSON.stringify(tree), /Unable to load activity/)
  assert.doesNotMatch(JSON.stringify(tree), /private backend detail/)
  const retry = nodes(tree).find(node => node.type === "Button")
  assert.equal(retry.props.children.at(-1), "Retry")

  retry.props.onClick()
  ui.render("workspace")
  tree = ui.render("workspace")
  assert.match(JSON.stringify(tree), /Loading activity/)
  await tick()
  assert.match(JSON.stringify(ui.render("workspace")), /No activity recorded yet/)
  assert.equal(reads, 2)
})

const button = (tree, label) => nodes(tree).find(node => node.type === "Button" && JSON.stringify(node.props.children).includes(label))

test("Activity retries the failed older page without discarding accumulated history", async () => {
  let olderReads = 0
  const cursors = []
  const ui = fixture((_workspace, cursor) => {
    cursors.push(cursor)
    return !cursor
    ? Promise.resolve({ events: [event("latest")], nextCursor: "latest" })
    : cursor === "latest" ? Promise.resolve({ events: [event("latest"), event("middle")], nextCursor: "middle" })
    : ++olderReads === 1 ? Promise.resolve({ error: "Unable to load activity. Please retry." })
    : Promise.resolve({ events: [event("middle"), event("older")], nextCursor: null })
  })
  ui.render("workspace"); await tick()
  button(ui.render("workspace"), "Load older activity").props.onClick()
  await tick()
  button(ui.render("workspace"), "Load older activity").props.onClick()
  await tick()
  let tree = ui.render("workspace")
  assert.match(JSON.stringify(tree), /latest/)
  assert.match(JSON.stringify(tree), /middle/)
  assert.match(JSON.stringify(tree), /Unable to load activity/)
  button(tree, "Retry").props.onClick()
  ui.render("workspace")
  await tick()
  tree = ui.render("workspace")
  assert.deepEqual(cursors, [undefined, "latest", "middle", "middle"])
  assert.deepEqual(nodes(tree).filter(node => node.type === "li").map(node => node.props.children[1].props.children[0].props.children[0].props.children), ["latest", "middle", "older"])
  assert.equal(button(tree, "Load older activity"), undefined)
})

test("Activity refresh invalidates an older page response and resets continuation", async () => {
  const older = deferred()
  let reads = 0
  const ui = fixture((_workspace, cursor) => cursor ? older.promise : Promise.resolve({ events: [event(++reads === 1 ? "latest" : "fresh")], nextCursor: "boundary" }))
  ui.render("workspace", 1); await tick()
  button(ui.render("workspace", 1), "Load older activity").props.onClick()
  ui.render("workspace", 2); await tick()
  older.resolve({ events: [event("stale")], nextCursor: null }); await tick()
  const tree = ui.render("workspace", 2)
  assert.match(JSON.stringify(tree), /fresh/)
  assert.doesNotMatch(JSON.stringify(tree), /stale/)
  assert.ok(button(tree, "Load older activity"))
})

test("Activity ignores an older page when the workspace switches", async () => {
  const older = deferred()
  const ui = fixture((workspace, cursor) => cursor ? older.promise : Promise.resolve({ events: [event(workspace)], nextCursor: "boundary" }))
  ui.render("old"); await tick()
  button(ui.render("old"), "Load older activity").props.onClick()
  assert.doesNotMatch(JSON.stringify(ui.render("current")), /old@example/)
  await tick()
  older.resolve({ events: [event("leaked")], nextCursor: null }); await tick()
  assert.doesNotMatch(JSON.stringify(ui.render("current")), /leaked/)
})
