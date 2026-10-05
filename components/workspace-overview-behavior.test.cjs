const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')

function harness(onAddTask) {
  const state = []
  let cursor = 0
  const react = { useState: initial => {
    const i = cursor++
    if (!(i in state)) state[i] = initial
    return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }]
  }, useRef: () => ({ current: null }), useEffect() {}, useMemo: fn => fn() }
  const jsx = (type, props) => ({ type, props })
  function load(file, dependencies) {
    const exports = {}
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
    new Function('require', 'exports', source)(name => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`)
      return dependencies[name]
    }, exports)
    return exports
  }
  const permissions = load('hooks/usePermissions.ts', { react, '@/lib/identity': { normalizeEmail: value => value?.trim().toLowerCase() ?? '' } })
  const quickAdd = load('components/task-quick-add.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Plus: 'Plus', Loader2: 'Loader2' },
    '@/components/ui/button': { Button: 'Button' }, '@/components/ui/input': { Input: 'Input' }, '@/components/ui/textarea': { Textarea: 'Textarea' },
    '@/lib/mutation-result': { getMutationError: result => result?.error }, '@/lib/task-time': { localDateTimeToIso: () => undefined },
  })
  const overview = load('components/workspace-overview.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'lucide-react': Object.fromEntries(['ArrowRight','CalendarDays','Check','Circle','Clock3','Plus','Target'].map(name => [name,name])),
    '@/components/ui/button': { Button: 'Button' }, '@/components/task-quick-add': quickAdd, '@/components/ui/progress': { Progress: 'Progress' },
    '@/lib/task-overview': { groupTasksForOverview: tasks => ({ overdue: [], today: tasks, next: [], completed: [], completion: 0 }) },
    '@/lib/task-time': { todayCalendarDate: () => '2026-10-04', formatTaskDue: () => '', formatCalendarDate: () => '' },
    '@/hooks/usePermissions': permissions,
  })
  const task = { id: 'task', title: 'Task', createdBy: 'owner@example.test', workspaceId: 'workspace', completed: false }
  let toggles = 0
  const props = { workspace: { id: 'workspace', name: 'Workspace', timezone: 'UTC', ownerId: 'owner@example.test' }, tasks: [task], currentUserEmail: 'member@example.test', loading: false, onToggleTask: () => { toggles++ }, onOpenTask() {}, onOpenBoard() {}, onAddTask }
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node.type === 'function' ? nodes(node.type(node.props)) : [node, ...nodes(node.props?.children)]
  return { render(overrides = {}) { cursor = 0; return nodes(overview.WorkspaceOverview({ ...props, ...overrides })) }, toggles: () => toggles }
}

test('Overview completion follows the same owner creator assignee permission as Board', () => {
  const ui = harness(async () => ({}))
  const toggle = rows => rows.find(node => node.props?.['aria-label'] === 'Complete Task')
  const denied = toggle(ui.render())
  assert.equal(denied.props.disabled, true)
  denied.props.onClick()
  assert.equal(ui.toggles(), 0)
  assert.equal(toggle(ui.render({ currentUserEmail: 'owner@example.test' })).props.disabled, false)
  assert.equal(toggle(ui.render({ tasks: [{ id: 'task', title: 'Task', createdBy: 'owner@example.test', workspaceId: 'workspace', assigneeEmail: 'member@example.test' }] })).props.disabled, false)
})

test('Overview announces loading without showing incomplete progress or counts', () => {
  const ui = harness(async () => ({}))
  const rows = ui.render({ loading: true })
  assert.equal(rows.some(node => node.type === 'Progress'), false)
  assert.doesNotMatch(JSON.stringify(rows), /due today|coming next|completed/)
  assert.ok(rows.some(node => node.props?.children === 'Loading tasks…'))
  assert.equal(rows.find(node => node.props?.id === 'project-board').props['aria-busy'], true)
})

test('quick add transport failure retains the draft and settles loading', async () => {
  const ui = harness(async () => { throw new Error('private transport details') })
  ui.render().find(node => node.type === 'Input').props.onChange({ target: { value: 'Keep draft' } })
  await ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  const rows = ui.render()
  assert.equal(rows.find(node => node.type === 'Input').props.value, 'Keep draft')
  assert.equal(rows.find(node => node.type === 'Input').props.disabled, false)
  assert.equal(rows.find(node => node.type === 'Button' && node.props.type === 'submit').props.disabled, true)
  assert.match(JSON.stringify(rows), /Refresh.*retry/i)
  assert.doesNotMatch(JSON.stringify(rows), /private transport details/)
})

test('Dashboard uncertain result requires reconciliation before quick add retry', async () => {
  const ui = harness(async () => ({ error: 'Request failed', unknownOutcome: true }))
  ui.render().find(node => node.type === 'Input').props.onChange({ target: { value: 'Keep draft' } })
  await ui.render().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(ui.render().find(node => node.type === 'Button' && node.props.type === 'submit').props.disabled, true)
  const dashboard = fs.readFileSync('app/dashboard/page.tsx', 'utf8')
  const handler = dashboard.slice(dashboard.indexOf('const handleAddTask ='), dashboard.indexOf('const handleToggleTask ='))
  assert.match(handler, /unknownOutcome: true/)
})
