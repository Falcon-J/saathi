const assert = require("node:assert/strict")
const fs = require("node:fs")
const test = require("node:test")
const ts = require("typescript")

const jsx = (type, props) => ({ type, props })
const moduleExports = {}
const formattedZones = []

test('clearing compact board filters resets them atomically without clearing search', () => {
  const calls=[]
  const tree=moduleExports.TaskList({ tasks:[],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',compactToolbar:true,
    paging:{filters:{search:'Keep search',status:'active',priority:'high',assigneeEmail:'person'},changeFilters:changes=>calls.push(changes)},
  })
  nodes(tree).find(n=>n.type==='TaskFilter').props.onClearFilters()
  assert.deepEqual(calls,[{status:'all',priority:undefined,assigneeEmail:undefined}])
})
const react = {
  memo: component => component,
  useState: initial => [initial, () => {}],
  useMemo: callback => callback(),
  useRef: current => ({ current }),
  useEffect() {},
}
const components = ["Button", "Card", "Badge", "Textarea", "TaskQuickAdd", "TaskFilter", "ConfirmDialog", "Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle", "Label", "TaskComments"]
const icons = ["CheckCircle2", "Circle", "Trash2", "Loader2", "Users", "Edit2", "Calendar", "Flag", "Clock", "AlertCircle", "SquarePen", "MoreHorizontal"]
const dependencies = {
  "@/lib/capability-ceiling": require("../lib/capability-ceiling.ts"),
  react,
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "lucide-react": Object.fromEntries(icons.map(icon => [icon, icon])),
  "@/components/ui/dropdown-menu": Object.fromEntries(["DropdownMenu","DropdownMenuContent","DropdownMenuItem","DropdownMenuTrigger"].map(name=>[name,name])),
  "@/components/ui/button": { Button: "Button" },
  "@/components/ui/card": { Card: "Card" },
  "@/components/ui/badge": { Badge: "Badge" },
  "@/components/ui/textarea": { Textarea: "Textarea" },
  "@/components/task-quick-add": { TaskQuickAdd: "TaskQuickAdd" },
  "@/components/task-filter": { TaskFilter: "TaskFilter" },
  "@/components/confirm-dialog": { ConfirmDialog: "ConfirmDialog" },
  "@/components/ui/input": { Input: "Input" },
  "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle"].map(component => [component, component])),
  "@/components/ui/label": { Label: "Label" },
  "@/app/tasks/actions": { getTaskById: async () => ({ error: "Unused in board rendering" }) },
  "@/components/task-comments": { TaskComments: "TaskComments" },
  "@/hooks/usePermissions": { useTaskPermissions: () => ({ canToggle: true, canEdit: true, canDelete: true, canAssign: true }) },
  "@/lib/mutation-result": { getMutationError: () => undefined },
  "@/lib/task-draft": { buildTaskUpdate: () => ({}), toTaskEditorDraft: () => ({}) },
  '@/lib/draft-storage': { readDraft: () => null, writeDraft() {}, removeDraft() {}, isDraftRecord: value => Boolean(value && typeof value === 'object') }, "@/lib/task-time": { formatTaskDue: (dueAt, _dueDate, timeZone) => { formattedZones.push(timeZone); return dueAt ? "Jul 3, 2:30 PM" : null } },
}
const source = ts.transpileModule(fs.readFileSync("components/task-list.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
new Function("require", "exports", source)(name => {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`)
  return dependencies[name]
}, moduleExports)

function nodes(node) {
  if (!node || typeof node !== "object") return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (typeof node.type === "function") return nodes(node.type(node.props))
  return [node, ...nodes(node.props?.children)]
}

function text(node) {
  if (typeof node === "string") return node
  if (!node || typeof node !== "object") return ""
  if (Array.isArray(node)) return node.map(text).join(" ")
  return text(node.props?.children)
}

test("paged Board distinguishes workspace totals and says when empty columns have more pages", () => {
  formattedZones.length = 0
  const tree = moduleExports.TaskList({
    tasks: [{ id: "task-1", title: "Current page task", completed: false, status: "todo", workspaceId: "workspace", createdBy: "owner@example.test", priority: "medium", createdAt: "2026-10-06T00:00:00Z", dueAt: "2026-07-03T07:00:00Z" }],
    loading: false,
    members: [],
    currentUserEmail: "owner@example.test",
    workspaceOwnerId: "owner@example.test",
    timeZone: "Asia/Kolkata",
    onAddTask: async () => ({}),
    onToggleTask: async () => ({}),
    onDeleteTask: async () => ({}),
    onEditTask: async () => ({}),
    paging: { filters: {}, aggregates: { total: 80, open: 60, done: 20, overdue: 0, byStatus: { todo: 40, "in-progress": 20, done: 20 }, byPriority: { low: 0, medium: 0, high: 0 } }, nextCursor: "older-page", loadingMore: false, loadMore: async () => {}, changeFilters() {} },
  })
  const rendered = nodes(tree)
  const copy = rendered.map(node => text(node.props?.children)).join(" ")

  assert.match(copy, /Workspace totals/)
  assert.match(copy, /Showing 1 matching task so far/)
  assert.match(copy, /No matching tasks on this page\. Load more to check remaining results\./)
  assert.doesNotMatch(copy, /No completed tasks match these filters\./)
  assert.doesNotMatch(copy, /Created Today/)
  assert.doesNotMatch(copy, />?Status\s+To do/)
  assert.match(copy, /Due\s+Jul 3, 2:30 PM/)
  assert.ok(formattedZones.includes("Asia/Kolkata"))
  assert.ok(rendered.some(node => node.type === "select" && node.props["aria-label"] === "Change status for Current page task"))
})

test('canvas board leaves task creation to the persistent command action',()=>{
 const tree=moduleExports.TaskList({tasks:[],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',compactToolbar:true});
 assert.equal(nodes(tree).find(n=>n.type==='TaskFilter').props.toolbarAction,undefined);
});

test('compact canvas rows prioritize titles and owners instead of repeated edit forms',()=>{
 const tasks=Array.from({length:3},(_,i)=>({id:'compact-'+i,workspaceId:'workspace',title:'Action '+i,description:'Details belong in the task sheet',status:'todo',completed:false,createdBy:'owner',assigneeEmail:'member@example.test',priority:'medium'}));
 const props={tasks,loading:false,members:[{id:'m',email:'member@example.test',username:'Maya'}],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',compactToolbar:true};
 const rendered=nodes(moduleExports.TaskList(props));
 assert.equal(rendered.filter(n=>n.props?.['data-task-row']).length,3);
 assert.equal(rendered.some(n=>n.type==='select'&&n.props['aria-label']?.startsWith('Change status')),false);
 assert.equal(rendered.some(n=>n.type==='select'&&n.props['aria-label']?.startsWith('Assign ')),false);
 assert.equal(rendered.some(n=>n.props?.children==='Details belong in the task sheet'),false);
 assert.ok(rendered.some(n=>n.props?.children==='Maya'));
 assert.ok(rendered.some(n=>n.type==='DropdownMenuItem'&&n.props.children==='Delete task'));
 const readOnly=nodes(moduleExports.TaskList({...props,capabilityCeiling:{read:true,edit:false,delete:false,create:false,comment:false,manage:false}}));
 assert.ok(readOnly.filter(n=>n.type==='Button'&&n.props['aria-label']?.startsWith('Complete ')).every(n=>n.props.disabled));
 assert.equal(readOnly.some(n=>n.type==='DropdownMenuItem'&&n.props.children==='Delete task'),false);
});
