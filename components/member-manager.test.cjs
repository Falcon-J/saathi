const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")

const source = readFileSync(path.join(__dirname, "member-manager.tsx"), "utf8")

test("member invitations keep validation feedback beside the invite field", () => {
  assert.match(source, /setLastError\("Enter a team member's email address\."\)/)
  assert.match(source, /setLastError\("Enter a valid email address, such as user@example\.com\."\)/)
  assert.doesNotMatch(source, /useNotifications/)
})

test("owners can recover a pending invitation without relying on email delivery", () => {
  assert.match(source, /Copy invite link/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /after they sign up or sign in with that email/)
  assert.match(source, /invitation\.status.*Expires/)
  assert.doesNotMatch(source, /deliveryStatus|resendInvitation|Email status|>Resend</)
  const hook = readFileSync(path.join(__dirname, "../hooks/use-workspaces.ts"), "utf8")
  assert.match(hook, /success\("Invitation created", "Share the invite link from Team/)
  assert.doesNotMatch(hook, /deliveryStatus|Email delivery is queued|accepted by the provider/)
})


test("invitation loading does not announce an empty team before the request resolves", async () => {
  const ts = require("typescript")
  let resolve
  let pending = new Promise(done => { resolve = done })
  const slots = []
  let cursor = 0, effects = [], tree
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value }]
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!equal(slots[index]?.deps, deps)) slots[index] = { callback, deps }
      return slots[index].callback
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!equal(slots[index]?.deps, deps)) { slots[index] = { deps }; effects.push(effect) }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const dependencies = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
    "lucide-react": { X: "X", Plus: "Plus", Users: "Users", Loader2: "Loader2", Crown: "Crown" },
    "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
    "@/app/actions/invitations": { getWorkspaceInvitations: () => pending },
    "@/lib/mutation-result": { getMutationError: result => result?.error },
    "@/lib/identity": { normalizeEmail: value => value.trim().toLowerCase() },
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function("require", "exports", compiled)(name => dependencies[name], exports)
  const render = () => {
    cursor = 0
    tree = exports.MemberManager({ workspaceId: "workspace", members: [], currentUserEmail: "owner@example.com", workspaceOwnerId: "owner@example.com" })
    const scheduled = effects; effects = []; scheduled.forEach(effect => effect())
    return JSON.stringify(tree)
  }
  const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  assert.match(render(), /Loading invitations/)
  assert.doesNotMatch(render(), /No invitations yet/)
  resolve([])
  await new Promise(done => setImmediate(done))
  assert.match(render(), /No invitations yet/)
  // A retry after a failed refresh remains actionable and never claims an empty result.
  pending = Promise.reject(new Error("Invitations unavailable"))
  // Start another instance so the initial effect performs the failed request.
  slots.length = 0
  render()
  await new Promise(done => setImmediate(done))
  assert.match(render(), /Invitations unavailable/)
  assert.doesNotMatch(render(), /No invitations yet/)
  pending = new Promise(done => { resolve = done })
  nodes(tree).find(node => node.type === "Button" && node.props.children === "Retry invitations").props.onClick()
  assert.match(render(), /Loading invitations/)
  resolve([])
  await new Promise(done => setImmediate(done))
  assert.match(render(), /No invitations yet/)
})
