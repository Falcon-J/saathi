const assert = require("node:assert/strict")
const test = require("node:test")
const fs = require("node:fs")
const ts = require("typescript")

const jsx = (type, props, key) => ({ type, props, key })
let state = []
let stateIndex = 0
const useState = initial => {
  const index = stateIndex++
  if (!(index in state)) state[index] = initial
  return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value }]
}
const names = ["AlertCircle", "Calendar", "CheckCircle2", "Circle", "Clock", "Edit2", "Flag", "Loader2", "SquarePen", "Trash2", "Users"]
const dependencies = {
  "@/lib/capability-ceiling": require("../lib/capability-ceiling.ts"),
  react: { memo: component => component, useState, useMemo: callback => callback(), useRef: current => ({ current }), useEffect() {} },
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "lucide-react": Object.fromEntries(names.map(name => [name, name])),
  "@/components/ui/button": { Button: "Button" },
  "@/components/ui/input": { Input: "Input" },
  "@/components/ui/card": { Card: "Card" },
  "@/components/ui/badge": { Badge: "Badge" },
  "@/components/ui/textarea": { Textarea: "Textarea" },
  "@/components/task-quick-add": { TaskQuickAdd: "TaskQuickAdd" },
  "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
  "@/components/task-filter": { TaskFilter: "TaskFilter" },
  "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map(name => [name, name])),
  "@/components/ui/label": { Label: "Label" },
  "@/hooks/usePermissions": { useTaskPermissions: () => ({ canEdit: true, canDelete: true, canToggle: true, canAssign: true }) },
  "@/lib/mutation-result": { getMutationError: result => result?.error },
  "@/lib/task-draft": { buildTaskUpdate: (task, draft) => draft.title === task.draft.title ? {} : { title: draft.title }, toTaskEditorDraft: task => ({ ...task.draft }) },
  '@/lib/draft-storage': { readDraft: () => null, writeDraft() {}, removeDraft() {}, isDraftRecord: value => Boolean(value && typeof value === 'object') }, "@/lib/task-time": { formatTaskCreatedAt: () => "", formatTaskDue: () => "" },
  "@/app/tasks/actions": { getTaskById: async () => ({ task: latestTask }) },
  "@/components/task-comments": { TaskComments: "TaskComments" },
}
let latestTask = null
const moduleExports = {}
const source = ts.transpileModule(fs.readFileSync("components/task-list.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function("require", "exports", source)(name => {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`)
  return dependencies[name]
}, moduleExports)

const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
const text = node => !node || typeof node !== "object" ? String(node ?? "") : Array.isArray(node) ? node.map(text).join("") : text(node.props?.children)
const draft = { title: "My careful edit", description: "Context", status: "todo", priority: "medium", dueDate: "", dueTime: "", estimatedMinutes: "", assigneeEmail: "" }
const render = (canEdit, error, overrides = {}) => {
  stateIndex = 0
  return moduleExports.TaskEditorDialog({
    task: { id: "task", draft: { ...draft, title: "Original title" } }, draft, canEdit, canComment: false, error, isSaving: false, members: [],
    onDraftChange() {}, onClose() {}, onSubmit() {}, async onReviewLatest() {}, ...overrides,
  })
}

test("task editor announces a conflict and preserves draft fields for recovery", () => {
  const tree = render(true, "This task changed while you were editing it.")
  const parts = nodes(tree)
  const alert = parts.find(node => node.props?.role === "alert")
  assert.ok(alert)
  assert.doesNotMatch(text(alert), /copy your draft/i)
  assert.ok(parts.some(node => node.type === "Button" && text(node) === "Review latest task"))
  assert.equal(parts.find(node => node.type === "Input" && node.props.id === "task-edit-title").props.value, draft.title)
  assert.equal(parts.find(node => node.type === "Textarea").props.value, draft.description)
  assert.ok(parts.some(node => node.type === "Button" && text(node) === "Save changes"))
})

test("read-only task details keep fields disabled and omit the save action", () => {
  const parts = nodes(render(false, null))
  assert.equal(parts.find(node => node.type === "fieldset").props.disabled, true)
  assert.equal(parts.some(node => node.type === "Button" && text(node) === "Save changes"), false)
})

test("opening the task editor focuses its heading without requesting a text keyboard", () => {
  state = []
  const parts = nodes(render(true, null))
  const heading = parts.find(node => node.type === "DialogTitle")
  const content = parts.find(node => node.type === "DialogContent")
  let focused = 0
  let prevented = 0
  assert.equal(heading.props.tabIndex, -1)
  heading.props.ref.current = { focus: () => focused++ }
  content.props.onOpenAutoFocus({ preventDefault: () => prevented++ })
  assert.equal(prevented, 1)
  assert.equal(focused, 1)
  assert.equal(parts.some(node => node.props?.autoFocus), false)
})

test("phone task editor uses a bottom sheet while keeping its named modal and scrollable body", () => {
  state = []
  const parts = nodes(render(true, null))
  const content = parts.find(node => node.type === "DialogContent")
  assert.equal(text(parts.find(node => node.type === "DialogTitle")), "Edit task")
  for (const token of ["saathi-mobile-controls", "max-sm:bottom-0", "max-sm:top-auto", "max-sm:left-0", "max-sm:max-w-none", "max-sm:translate-x-0", "max-sm:translate-y-0", "max-sm:max-h-[calc(100dvh-0.5rem)]", "max-sm:rounded-b-none", "max-sm:rounded-t-2xl", "max-sm:animate-none!"]) {
    assert.ok(content.props.className.split(" ").includes(token), `sheet must apply ${token}`)
  }
  assert.ok(parts.some(node => node.props?.className?.includes("min-h-0 flex-1 space-y-6 overflow-y-auto")))
  assert.equal(text(nodes(render(false, null)).find(node => node.type === "DialogTitle")), "Task details")
})

test("phone footer retains external submit and cancel actions side by side above the safe area", () => {
  state = []
  let submitted = 0
  const parts = nodes(render(true, null, { onSubmit: event => { event.preventDefault(); submitted++ } }))
  const footer = parts.find(node => node.type === "DialogFooter")
  const actions = nodes(footer).filter(node => node.type === "Button")
  assert.deepEqual(actions.map(text), ["Cancel", "Save changes"])
  assert.ok(footer.props.className.split(" ").includes("flex-row"))
  assert.ok(footer.props.className.includes("max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"))
  for (const action of actions) {
    assert.ok(action.props.className.includes("max-sm:min-h-11"))
    assert.ok(action.props.className.includes("max-sm:min-w-11"))
  }
  assert.equal(actions[1].props.type, "submit")
  const form = parts.find(node => node.type === "form" && node.props.id === actions[1].props.form)
  assert.ok(form, "fixed footer save must still target the editor form")
  form.props.onSubmit({ preventDefault() {} })
  assert.equal(submitted, 1)
})

test("status and assignee share a row from 360px and retain field edits", () => {
  state = []
  const changes = []
  const parts = nodes(render(true, null, { onDraftChange: value => changes.push(value) }))
  const row = parts.find(node => node.type === "div" && node.props?.className?.includes("min-[360px]:grid-cols-2"))
  assert.ok(row)
  assert.ok(row.props.className.split(" ").includes("grid-cols-1"))
  const status = nodes(row).find(node => node.props?.id === "task-edit-status")
  const assignee = nodes(row).find(node => node.props?.id === "task-edit-assignee")
  assert.equal(status.props.value, draft.status)
  assert.equal(assignee.props.value, draft.assigneeEmail)
  status.props.onChange({ target: { value: "in-progress" } })
  assignee.props.onChange({ target: { value: "member@example.test" } })
  assert.deepEqual(changes, [{ status: "in-progress" }, { assigneeEmail: "member@example.test" }])
})

test("optional planning stays mounted behind a closed disclosure after discussion", () => {
  state = []
  const changes = []
  const parts = nodes(render(true, null, { onDraftChange: value => changes.push(value) }))
  const details = parts.find(node => node.type === "details")
  assert.ok(details)
  assert.equal(Boolean(details.props.open), false)
  assert.equal(text(nodes(details).find(node => node.type === "summary")), "More details")
  assert.ok(parts.indexOf(parts.find(node => node.type === "TaskComments")) < parts.indexOf(details))
  const optional = nodes(details)
  for (const id of ["task-edit-priority", "task-edit-due-date", "task-edit-due-time", "task-edit-estimate"]) {
    assert.ok(optional.some(node => node.props?.id === id), `${id} must retain its mounted value`)
  }
  for (const id of ["task-edit-status", "task-edit-assignee"]) {
    assert.ok(parts.some(node => node.props?.id === id))
    assert.equal(optional.some(node => node.props?.id === id), false)
  }
  optional.find(node => node.props?.id === "task-edit-estimate").props.onChange({ target: { value: "45" } })
  assert.deepEqual(changes, [{ estimatedMinutes: "45" }])
})

test("discussion owns its own form while disclosed controls still submit with the editor", () => {
  state = []
  const parts = nodes(render(true, null, { canComment: true }))
  const form = parts.find(node => node.type === "form" && node.props.id === "task-editor-form")
  assert.equal(nodes(form).some(node => node.type === "TaskComments"), false)
  const details = parts.find(node => node.type === "details")
  for (const control of nodes(details).filter(node => ["Input", "select"].includes(node.type))) {
    assert.equal(control.props.form, "task-editor-form")
  }
})

test("discussion and planning have distinct identities that both reset when switching tasks", () => {
  state = []
  const identities = id => {
    const parts = nodes(render(true, null, { task: { id, draft } }))
    return [parts.find(node => node.type === "TaskComments").key, parts.find(node => node.type === "details").key]
  }
  const first = identities("first-task")
  const second = identities("second-task")
  assert.ok(first.every(key => key !== undefined))
  assert.notEqual(first[0], first[1], "siblings must have distinct React keys")
  assert.notEqual(first[0], second[0], "switching tasks must reset the comment draft lifecycle")
  assert.notEqual(first[1], second[1], "switching tasks must reset disclosure state")
})

test("invalid optional fields reveal themselves while conflict recovery remains outside the disclosure", () => {
  state = []
  const parts = nodes(render(true, "Estimate must be at most 1440 minutes", { latestTask: { draft } }))
  const details = parts.find(node => node.type === "details")
  assert.ok(details)
  assert.equal(details.props.open, true)
  const element = { open: false }
  details.props.onInvalidCapture({ currentTarget: element })
  assert.equal(element.open, true)
  assert.equal(nodes(details).some(node => node.props?.role === "alert"), false)
  assert.equal(nodes(details).some(node => node.props?.["aria-label"] === "Latest saved task"), false)
  assert.ok(parts.some(node => node.props?.["aria-label"] === "Latest saved task"))
})

test("native optional-field validation opens planning without replacing unsaved values", () => {
  state = []
  const unsaved = { ...draft, dueDate: "2026-12-05", dueTime: "10:30", estimatedMinutes: "2000", priority: "high" }
  const changes = []
  const draw = () => nodes(render(true, null, { draft: unsaved, onDraftChange: value => changes.push(value) }))
  const details = draw().find(node => node.type === "details")
  const element = { open: false }
  details.props.onInvalidCapture({ currentTarget: element })
  assert.equal(element.open, true)
  assert.deepEqual(changes, [], "revealing native validation must not rewrite the draft")
  const parts = draw()
  for (const [id, expected] of [["task-edit-title", unsaved.title], ["task-edit-description", "Context"], ["task-edit-due-date", "2026-12-05"], ["task-edit-due-time", "10:30"], ["task-edit-estimate", "2000"], ["task-edit-priority", "high"]]) {
    assert.equal(parts.find(node => node.props?.id === id).props.value, expected)
  }
  const estimate = parts.find(node => node.props?.id === "task-edit-estimate")
  assert.equal(estimate.props.form, "task-editor-form")
  assert.equal(estimate.props.max, 1440)
})

for (const trigger of ["Cancel", "dialog dismissal"]) {
  test(`dirty task draft requires confirmation on ${trigger}`, () => {
    state = []
    let closes = 0
    const draw = () => render(true, "This task changed while you were editing it.", { onClose: () => closes++ })
    let parts = nodes(draw())
    if (trigger === "Cancel") parts.find(node => node.type === "Button" && text(node) === "Cancel").props.onClick()
    else parts.find(node => node.type === "Dialog").props.onOpenChange(false)
    assert.equal(closes, 0, "dirty draft must remain open until discard is confirmed")
    parts = nodes(draw())
    let confirm = parts.find(node => node.type === "ConfirmDialog" && node.props.open)
    assert.ok(confirm)
    assert.equal(parts.find(node => node.type === "Input" && node.props.id === "task-edit-title").props.value, draft.title)
    confirm.props.onCancel()
    assert.equal(closes, 0)
    parts = nodes(draw())
    assert.equal(parts.find(node => node.type === "ConfirmDialog").props.open, false)
    parts.find(node => node.type === "Dialog").props.onOpenChange(false)
    confirm = nodes(draw()).find(node => node.type === "ConfirmDialog")
    confirm.props.onConfirm()
    assert.equal(closes, 1)
  })
}

test("unchanged task dialogs close without confirmation", () => {
  for (const overrides of [{ task: { id: "task", draft } }, { canEdit: false, task: { id: "task", draft } }]) {
    state = []
    let closes = 0
    const tree = render(true, null, { ...overrides, onClose: () => closes++ })
    nodes(tree).find(node => node.type === "Dialog").props.onOpenChange(false)
    assert.equal(closes, 1)
  }
})

test("pending saves block dialog dismissal and disable Cancel", () => {
  state = []
  let closes = 0
  const tree = render(true, null, { isSaving: true, onClose: () => closes++ })
  const parts = nodes(tree)
  parts.find(node => node.type === "Dialog").props.onOpenChange(false)
  assert.equal(closes, 0)
  assert.equal(parts.find(node => node.type === "Button" && text(node) === "Cancel").props.disabled, true)
})

test("canceling discard restores editor focus only while its title input is still mounted", () => {
  state = []
  let focuses = 0
  let prevented = 0
  const parts = nodes(render(true, null))
  const title = parts.find(node => node.type === "Input" && node.props.id === "task-edit-title")
  const confirmation = parts.find(node => node.type === "ConfirmDialog")
  assert.equal(typeof confirmation.props.onCloseAutoFocus, "function")
  title.props.ref.current = { isConnected: true, focus: () => focuses++ }
  confirmation.props.onCloseAutoFocus({ preventDefault: () => prevented++ })
  assert.equal(focuses, 1)
  assert.equal(prevented, 1)
  title.props.ref.current.isConnected = false
  confirmation.props.onCloseAutoFocus({ preventDefault: () => prevented++ })
  assert.equal(focuses, 1, "must not restore focus after the editor closes")
})

for (const outcome of ["success", "conflict"]) {
  test(`task editor ${outcome === "success" ? "closes after saving without discard confirmation" : "retains the draft when saving conflicts"}`, async () => {
    const task = { id: "task", draft: { ...draft, title: "Original title" }, version: 4 }
    state = [task, draft, null, null, null, "", null, "all", "all"]
    const saves = []
    const draw = () => {
      stateIndex = 0
      const tree = moduleExports.TaskList({
        tasks: [], loading: false, members: [], currentUserEmail: "owner@example.test", workspaceOwnerId: "owner@example.test", timeZone: "UTC",
        onEditTask: async (...args) => { saves.push(args); return outcome === "conflict" ? { error: "Task changed" } : { success: true } },
      })
      return nodes(tree).find(node => node.type === moduleExports.TaskEditorDialog)
    }
    await draw().props.onSubmit({ preventDefault() {} })
    assert.deepEqual(saves, [["task", { title: draft.title }, 4]])
    const editor = draw()
    if (outcome === "success") {
      assert.equal(editor.props.task, null)
      assert.equal(editor.props.draft, null)
    } else {
      assert.equal(editor.props.task, task)
      assert.equal(editor.props.draft, draft)
      assert.equal(editor.props.error, "Task changed")
    }
    assert.equal(editor.props.isSaving, false)
  })
}


test("task conflict review retains draft until explicit rebase and merges untouched fields", async () => {
  const original = { id: "task", workspaceId: "workspace", draft: { ...draft, title: "Original title" }, version: 4 }
  latestTask = { ...original, draft: { ...original.draft, description: "Remote description" }, version: 5 }
  state = [original, draft, "Task changed", null, null, "", null, "all", "all"]
  const saves=[]
  const draw=()=>{stateIndex=0;return nodes(moduleExports.TaskList({tasks:[],loading:false,members:[],currentUserEmail:"owner",workspaceOwnerId:"owner",timeZone:"UTC",onEditTask:async(...args)=>{saves.push(args);return {success:true}}})).find(n=>n.type===moduleExports.TaskEditorDialog)}
  assert.equal(typeof draw().props.onReviewLatest,"function")
  await draw().props.onReviewLatest()
  assert.equal(draw().props.draft.title,draft.title)
  assert.equal(draw().props.task.version,4)
  assert.equal(draw().props.latestTask.version,5)
  draw().props.onKeepDraft()
  assert.equal(draw().props.draft.description,"Remote description")
  assert.equal(draw().props.draft.title,draft.title)
  await draw().props.onSubmit({preventDefault(){}})
  assert.ok(saves.length, JSON.stringify(draw().props))
  assert.equal(saves[0][2],5)
})



test('Board reports combined editor and quick-add dirty state without false resets', () => {
  const original = { id: 'task', draft: { ...draft, title: 'Original title' }, version: 4 }
  state = [original, draft, null, null, null, '', null, 'all', 'all']
  const dirty=[]
  const oldEffect=dependencies.react.useEffect
  dependencies.react.useEffect=fn=>fn()
  try {
    const draw=()=>{stateIndex=0;return nodes(moduleExports.TaskList({tasks:[],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',onDirtyChange:value=>dirty.push(value)}))}
    let rows=draw()
    assert.equal(dirty.at(-1),true)
    rows.find(n=>n.type==='TaskQuickAdd').props.onDirtyChange(true)
    rows=draw()
    rows.find(n=>n.type==='TaskQuickAdd').props.onDirtyChange(false)
    draw()
    assert.equal(dirty.at(-1),true,'clearing quick add cannot clear a dirty editor')
    state[1]={...original.draft}
    draw()
    assert.equal(dirty.at(-1),false)
  } finally { dependencies.react.useEffect=oldEffect }
})

test("revoked edit permission preserves a dirty draft until explicit discard", () => {
 state=[];let closes=0;const draw=()=>render(false,null,{onClose:()=>closes++});nodes(draw()).find(n=>n.type==="Dialog").props.onOpenChange(false);assert.equal(closes,0);const confirm=nodes(draw()).find(n=>n.type==="ConfirmDialog");assert.equal(confirm.props.open,true);confirm.props.onConfirm();assert.equal(closes,1);
})
