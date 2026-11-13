const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
function harness(options = {}) {
  const slots = [], effects = [], calls = [], listeners = new Map()
  let cursor = 0, tree
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => value !== b[i])
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }] },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i] = { deps }; effects.push(fn) } },
  }
  react.useLayoutEffect = react.useEffect
  // Hook functions are destructured by compiled React components.
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps)
  const store = { workspaces: [], currentWorkspaceId: null, loading: false, workspaceError: null, realtime: { eventRevision: 0 }, refreshWorkspaces: async () => calls.push('refresh-workspaces'), setCurrentWorkspaceId: id => { store.currentWorkspaceId = id; calls.push(['workspace', id]) }, ...options.store }
  const graph = { entry: null, error: null, loading: false, reload: async () => true, ...options.graph }
  const companies = { resources: [], references: [], error: null, loading: false, reload: async () => calls.push('refresh-companies'), ...options.companies }
  const jsx = (type, props) => ({ type, props })
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/dynamic': { default: () => 'CanvasFlow' }, 'next/link': { default: 'Link' }, '@xyflow/react': { ReactFlowProvider: 'ReactFlowProvider' },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'Building2', 'List', 'Plus', 'RefreshCw', 'X'].map(key => [key, key])),
    '@/hooks/use-workspaces': { useWorkspaces: () => store }, '@/hooks/use-canvas-graph': { useCanvasGraph: () => graph }, './use-canvas-resources': { useCanvasResources: () => companies },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/lib/identity': require('../../lib/identity.ts'), '@/lib/mutation-result': require('../../lib/mutation-result.ts'), '@/lib/task-permission': require('../../lib/task-permission.ts'), '@/lib/capability-ceiling': require('../../lib/capability-ceiling.ts'), '@/features/access/contracts': { ACCESS_CAPABILITIES: ['read', 'create', 'edit', 'comment', 'manage', 'delete'] },
    '@/app/tasks/actions': { toggleTask() {} }, '@/app/actions/workspaces': { archiveWorkspace() {}, deleteWorkspace() {}, transferWorkspaceOwnership() {} },
  }
  for (const [path, exports] of Object.entries({ '@/components/workspace-board': ['WorkspaceBoard'], '@/components/workspace-create-form': ['WorkspaceCreateForm'], '@/components/next-work-view': ['NextWorkView'], '@/components/member-manager': ['MemberManager'], '@/components/workspace-settings': ['WorkspaceSettings'], '@/components/activity-history': ['ActivityHistory'], '@/components/ui/button': ['Button'], '@/components/ui/dialog': ['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'], './canvas-command-bar': ['CanvasCommandBar'], './company-panel': ['CompanyPanel'], './agent-activity': ['AgentActivity'], './contextual-workspace-create': ['ContextualWorkspaceCreate'] })) deps[path] = Object.fromEntries(exports.map(key => [key, key]))
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('components/canvas/canvas-shell.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'exports', 'window', code)(name => { assert.ok(name in deps, name); return deps[name] }, exports, { confirm: () => { calls.push("confirm"); return options.confirm?.() ?? true }, addEventListener(name, handler) { listeners.set(name, handler) }, removeEventListener() {} })
  return { render() { cursor = 0; tree = exports.CanvasShell({ actorId: 'actor', email: 'actor@example.test' }); effects.splice(0).forEach(fn => fn()); return nodes(tree) }, text() { return JSON.stringify(tree) }, store, graph, companies, calls, listeners }
}

test('company loading cannot masquerade as an empty account', () => {
  const ui = harness({ companies: { loading: true } })
  const result = ui.render()
  assert.equal(result.some(n => n.type === 'h2' && n.props.children === 'Create a workspace'), false)
  assert.match(ui.text(), /Loading compan/)
})

test('failed company reads expose recovery in the main canvas rather than an empty creation state', async () => {
  const ui = harness({ companies: { error: 'Company access unavailable' } })
  const result = ui.render()
  assert.equal(result.some(n => n.type === 'h2' && n.props.children === 'Create a workspace'), false)
  const mainAlert = result.find(n => n.props?.role === 'alert' && nodes(n).some(c => c.props?.children === 'Company access unavailable'))
  assert.ok(mainAlert)
  const retry = nodes(mainAlert).find(n => n.type === 'Button')
  await retry.props.onClick()
  assert.ok(ui.calls.includes('refresh-companies'))
})

module.exports = { harness, nodes }

test('exploring a section navigates the canvas instead of opening administration', () => {
  const ui = harness({ companies: { resources: [{ id: 'section', name: 'Delivery', parentId: null, workspaceId: null, capabilities: ['read'] }] } })
  ui.render().find(node => node.type === 'CanvasFlow').props.onOpenResource('section')
  const result = ui.render()
  assert.deepEqual(result.find(node => node.type === 'CanvasFlow').props.focus, { kind: 'resource', resourceId: 'section' })
  assert.equal(result.filter(node => node.type === 'Dialog').some(node => node.props.open), false)
})

test('canvas management accessible name includes its visible button label', () => {
  const button = harness().render().find(node => node.type === 'Button' && node.props['aria-label'] === 'Manage canvas')
  const label = nodes(button).find(node => node.type === 'span').props.children
  assert.ok(button.props['aria-label'].toLowerCase().includes(label.toLowerCase()))
})

 test('readiness summary opens actionable work while the task list preserves all authorized tasks', () => {
 const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};
 const task=(id,completed)=>({id,workspaceId:'w',title:id,completed,status:completed?'done':'todo',createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z'});
 const ui=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[task('ready-task',false),task('done-task',true)],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpenGroup('w','ready');
 const result=ui.render();
 assert.equal(result.filter(n=>n.type==='Dialog')[0].props.open,false);
 const work=result.find(n=>n.type==='NextWorkView');
 assert.equal(work.props.focusGroup,'ready'); assert.equal(work.props.workspace.id,'w');
 assert.equal(result.find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.value,'ready');
 result.find(n=>n.type==='CanvasCommandBar').props.onList();
 assert.ok(ui.render().filter(n=>n.type==='Button').some(n=>n.props.children?.[0]==='done-task'));
 });

test('workspace creation captures the selected section and keeps its destination stable', () => {
 const section={id:'section',name:'Delivery',kind:'section',parentId:null,workspaceId:null,version:3,capabilities:['read','manage','create']};
 const ui=harness({companies:{resources:[section]}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpenResource('section');
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Create workspace').props.onClick();
 const target=ui.render().find(n=>n.type==='ContextualWorkspaceCreate').props.target;
 assert.deepEqual(target,{id:'section',version:3,path:'Delivery'});
 section.version=4; section.name='Renamed';
 assert.deepEqual(ui.render().find(n=>n.type==='ContextualWorkspaceCreate').props.target,target);
});
test('read-only sections cannot silently create unattached workspaces',()=>{
 const ui=harness({companies:{resources:[{id:'section',name:'Delivery',kind:'section',parentId:null,workspaceId:null,version:1,capabilities:['read']}]}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpenResource('section');
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Create workspace').props.onClick();
 assert.equal(ui.render().filter(n=>n.type==='Dialog').some(n=>n.props.open),false);
 assert.match(ui.text(),/need create and manage access/);
});

test('workspace tools keep readable contrast while graph refresh disables the control',()=>{
 const button=harness({companies:{resources:[{id:'section',name:'Delivery',parentId:null,workspaceId:null,capabilities:['read']}]}}).render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools');
 assert.match(button.props.className,/disabled:opacity-100/);
});

test('read-only workspace tools land on Ready and Waiting with the actual workspace scope',()=>{
 const workspace={id:'w',name:'Delivery',ownerId:'other@example.test',members:[],capabilityCeiling:{read:true,create:false,edit:false,comment:false,manage:false,delete:false}};
 const ui=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();
 const result=ui.render();
 assert.equal(result.find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.value,'ready');
 assert.ok(result.some(n=>n.type==='NextWorkView'&&n.props.compact));
});

test('workspace picker focuses its selected workspace and avoids mounting an unused board',()=>{
 const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};
 const ui=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Current workspace').props.onChange({target:{value:'w'}});
 const result=ui.render();assert.deepEqual(result.find(n=>n.type==='CanvasFlow').props.focus,{kind:'workspace',workspaceId:'w'});
 assert.equal(result.some(n=>n.type==='WorkspaceBoard'),false);
 result.find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();
 assert.equal(ui.render().some(n=>n.type==='WorkspaceBoard'),false);
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});
 assert.equal(ui.render().some(n=>n.type==='WorkspaceBoard'),true);
});

test('a retained hidden task draft does not block reading work but still protects page exit',()=>{
 const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};const task={id:'a',workspaceId:'w',title:'Read work',status:'todo',completed:false,createdBy:'actor@example.test'};
 const ui=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[task],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true);
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'ready'}});
 let prevented=false;ui.listeners.get('beforeunload')({preventDefault(){prevented=true},returnValue:null});assert.equal(prevented,true);
 ui.render().find(n=>n.type==='NextWorkView').props.onOpenTask('a');
 assert.deepEqual(ui.render().find(n=>n.type==='CanvasFlow').props.focus,{kind:'task',workspaceId:'w',taskId:'a'});
});

test('page and workspace exits still guard a hidden in-memory draft when browser recovery fails',()=>{
 let accepted=true;const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};
 const ui=harness({confirm:()=>accepted,store:{workspaces:[workspace,{...workspace,id:'other'}],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true);
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'ready'}});
 accepted=false;let prevented=false;
 ui.render().find(n=>n.type==='Link'&&n.props['aria-label']==='Open dashboard').props.onClick({preventDefault(){prevented=true}});assert.equal(prevented,true);
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Current workspace').props.onChange({target:{value:'other'}});assert.equal(ui.store.currentWorkspaceId,'w');
 assert.equal(ui.calls.filter(c=>c==='confirm').length,3);
});
