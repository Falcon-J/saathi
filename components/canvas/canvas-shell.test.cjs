const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')
const historyModule = require('../../lib/browser-history.ts')
const shellCode = ts.transpileModule(fs.readFileSync('components/canvas/canvas-shell.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
function harness(options = {}) {
  const slots = [], effects = [], calls = [], listeners = new Map(), handlers = new Map()
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
  const entries = [{url:options.previousUrl ?? options.url ?? '/canvas',state:{__NA:true,tree:[options.previousUrl?'previous':'next']}}]
  let position=0, canonicalUrl=options.url??'/canvas'
  const relative=url=>{const value=new URL(url,'https://saathi.test');return value.pathname+value.search+value.hash}
  const history={
    get state(){return entries[position].state},
    get length(){return entries.length},
    replaceState(state,unused,url){entries[position]={state,url:relative(url??entries[position].url)}},
    pushState(state,unused,url){entries.splice(++position);entries.push({state,url:relative(url)} )},
    go(delta){const next=position+delta;if(next<0||next>=entries.length)return;position=next;browser.dispatchEvent({type:'popstate',state:history.state})},
    back(){history.go(-1)},forward(){history.go(1)},
  }
  const browser={history,get location(){return new URL(entries[position].url,'https://saathi.test')},dispatchEvent(event){let stopped=false;event.stopImmediatePropagation=()=>{stopped=true};for(const item of [...(handlers.get(event.type)??[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(stopped)break;item.handler(event)}},confirm: () => { calls.push("confirm"); return options.confirm?.() ?? true },addEventListener(name,handler,options){listeners.set(name,handler);handlers.set(name,[...(handlers.get(name)??[]),{handler,capture:options?.capture??false}])},removeEventListener(){}}
  historyModule.installHistoryPositions(browser)
  // Model installed Next's public history wrapper: marked writes bypass canonical restoration.
  for(const method of ['pushState','replaceState']){
    const original=history[method].bind(history)
    history[method]=(data,title,url)=>{if(!data?.__NA&&!data?._N){calls.push(['public-history',data,url]);canonicalUrl=url;data={...data,__NA:true,tree:history.state.tree}}original(data,title,url)}
  }
  if(options.previousUrl)history.pushState({__NA:true,tree:['next']},'',options.url??'/canvas')
  const jsx = (type, props) => ({ type, props })
  const deps = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/dynamic': { default: () => 'CanvasFlow' }, 'next/link': { default: 'Link' }, '@xyflow/react': { ReactFlowProvider: 'ReactFlowProvider' },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'Building2', 'ChevronDown', 'List', 'MoreHorizontal', 'Plus', 'RefreshCw', 'X', 'Map'].map(key => [key, key])),
    '@/hooks/use-workspaces': { useWorkspaces: () => store }, '@/hooks/use-canvas-graph': { useCanvasGraph: () => graph }, './use-canvas-resources': { useCanvasResources: () => companies },
    '@/features/canvas/model': require('../../features/canvas/model.ts'), '@/features/canvas/navigation-url': require('../../features/canvas/navigation-url.ts'), '@/lib/browser-history':historyModule, '@/lib/identity': require('../../lib/identity.ts'), '@/lib/mutation-result': require('../../lib/mutation-result.ts'), '@/lib/task-permission': require('../../lib/task-permission.ts'), '@/lib/capability-ceiling': require('../../lib/capability-ceiling.ts'), '@/features/access/contracts': { ACCESS_CAPABILITIES: ['read', 'create', 'edit', 'comment', 'manage', 'delete'] },
    '@/app/tasks/actions': { toggleTask() {} }, '@/app/actions/workspaces': { archiveWorkspace() {}, deleteWorkspace() {}, transferWorkspaceOwnership() {} },
  }
  for (const [path, exports] of Object.entries({ '@/components/workspace-board': ['WorkspaceBoard'], '@/components/workspace-create-form': ['WorkspaceCreateForm'], '@/components/next-work-view': ['NextWorkView'], '@/components/member-manager': ['MemberManager'], '@/components/workspace-settings': ['WorkspaceSettings'], '@/components/activity-history': ['ActivityHistory'], '@/components/ui/dropdown-menu': ['DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuSeparator'], '@/components/ui/button': ['Button'], '@/components/ui/dialog': ['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'], './canvas-command-bar': ['CanvasCommandBar'], './company-panel': ['CompanyPanel'], './agent-activity': ['AgentActivity'], './contextual-workspace-create': ['ContextualWorkspaceCreate'] })) deps[path] = Object.fromEntries(exports.map(key => [key, key]))
  const exports = {}
  new Function('require', 'exports', 'window', shellCode)(name => { assert.ok(name in deps, name); return deps[name] }, exports, browser)
  return { render() { cursor = 0; tree = exports.CanvasShell({ actorId: 'actor', email: 'actor@example.test' });for(const node of nodes(tree)){if(node.props?.ref)node.props.ref.current={focus:()=>calls.push(['focus',node.props['aria-label']])}} effects.splice(0).forEach(fn => fn()); return nodes(tree) }, text() { return JSON.stringify(tree) }, url:()=>entries[position].url, canonicalUrl:()=>canonicalUrl, entries, history, store, graph, companies, calls, listeners }
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

const historyWorkspace = (id = 'w') => ({id,name:id,ownerId:'actor@example.test',members:[]})
const historyGraph = (id = 'w', ids = ['t']) => ({workspace:historyWorkspace(id),complete:true,graph:{tasks:ids.map(taskId=>({id:taskId,workspaceId:id,title:taskId,createdBy:'actor@example.test',completed:false,status:'todo',createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z'})),dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}})
test('initial task URL waits for lists and current graph without overwriting the deep link',()=>{
 const ui=harness({url:'/canvas?workspace=w&task=t&view=tasks',store:{loading:true,currentWorkspaceId:'old'},graph:{loading:true}})
 ui.render();ui.render();assert.match(ui.url(),/task=t/)
 ui.store.loading=false;ui.store.workspaces=[historyWorkspace()];ui.render()
 assert.equal(ui.store.currentWorkspaceId,'w');assert.match(ui.url(),/task=t/)
 ui.render();assert.match(ui.url(),/task=t/)
 ui.graph.loading=false;ui.graph.entry=historyGraph();ui.render()
 const tree=ui.render();assert.deepEqual(tree.find(n=>n.type==='CanvasFlow').props.focus,{kind:'task',workspaceId:'w',taskId:'t'})
 assert.equal(tree.find(n=>n.type==='WorkspaceBoard').props.openTaskId,'t')
 assert.equal(tree.find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.value,'tasks')
 assert.equal(ui.history.state.__NA,true);assert.deepEqual(ui.history.state.tree,['next'])
})
test('Back and Forward restore work focus while dirty cancellation retains draft and history position',()=>{
 let allow=false
 const ui=harness({confirm:()=>allow,store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});ui.render()
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();ui.render()
 const readyUrl=ui.url()
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});ui.render()
 const taskUrl=ui.url()
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true)
 ui.history.back();ui.render();assert.equal(ui.url(),taskUrl)
 assert.equal(ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.value,'tasks')
 ui.history.back();ui.render();assert.equal(ui.url(),taskUrl)
 allow=true;ui.history.back();ui.render();ui.render();assert.equal(ui.url(),readyUrl)
 ui.history.forward();ui.render();ui.render();assert.equal(ui.url(),taskUrl)
 assert.equal(ui.history.state.__NA,true)
})
test('missing URL task recovers generically without private labels',()=>{
 const ui=harness({url:'/canvas?workspace=w&task=revoked&view=tasks',store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render();ui.render();ui.render()
 assert.equal(ui.url(),'/canvas');assert.match(ui.text(),/location is unavailable/)
 assert.deepEqual(ui.render().find(n=>n.type==='CanvasFlow').props.focus,{kind:'overview'})
})
test('browser workspace transitions protect retained drafts and wait for the destination graph',()=>{
 let allow=false
 const ui=harness({confirm:()=>allow,store:{workspaces:[historyWorkspace('w'),historyWorkspace('z')],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});ui.render()
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props['data-workspace-id']==='z').props.onSelect();ui.render()
 assert.match(ui.url(),/workspace=w/)
 ui.graph.entry=historyGraph('z');ui.render();assert.match(ui.url(),/workspace=z/)
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();ui.render()
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});ui.render()
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true,false)
 const original=ui.url();ui.history.go(-3);ui.render();assert.equal(ui.url(),original);assert.equal(ui.store.currentWorkspaceId,'z')
 allow=true;ui.history.go(-3);ui.render();assert.equal(ui.store.currentWorkspaceId,'w');assert.match(ui.url(),/workspace=w/)
 ui.render();assert.match(ui.url(),/workspace=w/)
 ui.graph.entry=historyGraph();ui.render();ui.render()
 assert.deepEqual(ui.render().find(n=>n.type==='CanvasFlow').props.focus,{kind:'workspace',workspaceId:'w'})
})
test('manual resource navigation supersedes a still loading deep link',()=>{
 const ui=harness({url:'/canvas?workspace=w&task=t&view=tasks',store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},companies:{resources:[{id:'section',name:'Delivery',parentId:null}]},graph:{loading:true}})
 ui.render();ui.render().find(n=>n.type==='CanvasFlow').props.onOpenResource('section');ui.render()
 ui.store.loading=false;ui.render();ui.render()
 assert.equal(ui.url(),'/canvas?resource=section')
 assert.deepEqual(ui.render().find(n=>n.type==='CanvasFlow').props.focus,{kind:'resource',resourceId:'section'})
})
test('cancelled page Back restores the current URL and saved Next tree for a retained draft',()=>{
 const ui=harness({previousUrl:'/dashboard',url:'/canvas?workspace=w&view=tasks',confirm:()=>false,store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render();ui.render();ui.render()
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true,false)
 const original=ui.url();ui.history.back();ui.render()
 assert.equal(ui.url(),original);assert.deepEqual(ui.history.state.tree,['next'])
 assert.equal(ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.value,'tasks')
 ui.history.back();ui.render();assert.equal(ui.url(),original)
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(false,false)
 ui.history.back();ui.render();assert.equal(ui.url(),'/dashboard');assert.equal(ui.entries[0].url,'/dashboard')
})
test('foreign Forward cancellation retains destination and later accepts the same entry',()=>{
 const ui=harness({url:'/canvas?workspace=w&view=tasks',confirm:()=>false,store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render();ui.render();ui.render()
 const original=ui.url()
 ui.history.pushState({__NA:true,tree:['dashboard']},'', '/dashboard')
 ui.history.back();ui.render();ui.render()
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true,false)
 ui.history.forward();ui.render();assert.equal(ui.url(),original);assert.equal(ui.entries[1].url,'/dashboard')
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(false,false)
 ui.history.forward();ui.render();assert.equal(ui.url(),'/dashboard')
})
test('unmarked pre-instrumentation destinations follow native history without erasing either entry',()=>{
 const ui=harness({previousUrl:'/dashboard',url:'/canvas?workspace=w&view=tasks',confirm:()=>false,store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render();ui.render();ui.render()
 delete ui.entries[0].state.__saathiHistoryPosition
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true,false)
 const destination=JSON.stringify(ui.entries[0]), current=JSON.stringify(ui.entries[1])
 ui.history.back();ui.render()
 assert.equal(ui.url(),'/dashboard');assert.equal(JSON.stringify(ui.entries[0]),destination);assert.equal(JSON.stringify(ui.entries[1]),current)
 assert.equal(ui.calls.includes('confirm'),false)
})
test('public task history updates Next canonical URL before server revalidation',()=>{
 const ui=harness({store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'t'});ui.render()
 const destination=ui.url();assert.equal(ui.canonicalUrl(),destination)
 for(const call of ui.calls.filter(call=>Array.isArray(call)&&call[0]==='public-history')){
   assert.equal(call[1].__NA,undefined);assert.equal(call[1]._N,undefined);assert.equal(call[1].__PRIVATE_NEXTJS_INTERNALS_TREE,undefined)
 }
 ui.history.replaceState({__NA:true,tree:['revalidated']},'',ui.canonicalUrl())
 assert.equal(ui.url(),destination);assert.match(destination,/task=t/)
})
test('explicit Work and readiness focus the selector without background or task focus theft',()=>{
 const ui=harness({store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});ui.render()
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();ui.render()
 assert.equal(ui.calls.filter(call=>Array.isArray(call)&&call[0]==='focus'&&call[1]==='Workspace tools').length,1)
 ui.graph.entry=historyGraph();ui.render();assert.equal(ui.calls.filter(call=>Array.isArray(call)&&call[0]==='focus'&&call[1]==='Workspace tools').length,1)
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpenGroup('w','waiting');ui.render()
 assert.equal(ui.calls.filter(call=>Array.isArray(call)&&call[0]==='focus'&&call[1]==='Workspace tools').length,2)
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'t'});ui.render()
 assert.equal(ui.calls.filter(call=>Array.isArray(call)&&call[0]==='focus'&&call[1]==='Workspace tools').length,2)
})
test('camera movement and measured width never add navigation entries',()=>{
 const ui=harness({store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph()}})
 const flow=ui.render().find(n=>n.type==='CanvasFlow')
 const count=ui.history.length
 flow.props.onZoom(0.3);ui.render();flow.props.onViewportWidthChange(390);ui.render();flow.props.onManualNavigation();ui.render()
 assert.equal(ui.history.length,count);assert.equal(ui.url(),'/canvas')
})
test('hidden dirty task editor blocks a different task but resumes its own canonical task',()=>{
 const ui=harness({store:{workspaces:[historyWorkspace()],currentWorkspaceId:'w'},graph:{entry:historyGraph('w',['t','other'])}})
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'other'});ui.render()
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'t'});ui.render()
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true,false,'t')
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Show canvas').props.onClick();ui.render()
 assert.equal(ui.render().find(n=>n.type==='WorkspaceBoard').props.active,false)
 const retained=ui.url()
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'other'});ui.render()
 assert.equal(ui.url(),retained);assert.match(ui.text(),/Save or discard/)
 ui.history.go(-2);ui.render();assert.equal(ui.url(),retained)
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'task',workspaceId:'w',taskId:'t'});ui.render()
 assert.equal(ui.render().find(n=>n.type==='WorkspaceBoard').props.active,true)
 assert.equal(ui.render().find(n=>n.type==='WorkspaceBoard').props.openTaskId,'t')
})

test('exploring a section navigates the canvas instead of opening administration', () => {
  const ui = harness({ companies: { resources: [{ id: 'section', name: 'Delivery', parentId: null, workspaceId: null, capabilities: ['read'] }] } })
  ui.render().find(node => node.type === 'CanvasFlow').props.onOpenResource('section')
  const result = ui.render()
  assert.deepEqual(result.find(node => node.type === 'CanvasFlow').props.focus, { kind: 'resource', resourceId: 'section' })
  assert.equal(result.filter(node => node.type === 'Dialog').some(node => node.props.open), false)
})

test('canvas management accessible name includes its visible button label', () => {
  const button = harness().render().find(node => node.type === 'DropdownMenuItem' && node.props['aria-label'] === 'Manage canvas')
  const label = 'Manage canvas'
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
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props['aria-label']==='Create workspace').props.onSelect();
 const target=ui.render().find(n=>n.type==='ContextualWorkspaceCreate').props.target;
 assert.deepEqual(target,{id:'section',version:3,path:'Delivery'});
 section.version=4; section.name='Renamed';
 assert.deepEqual(ui.render().find(n=>n.type==='ContextualWorkspaceCreate').props.target,target);
});
test('read-only sections cannot silently create unattached workspaces',()=>{
 const ui=harness({companies:{resources:[{id:'section',name:'Delivery',kind:'section',parentId:null,workspaceId:null,version:1,capabilities:['read']}]}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpenResource('section');
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props['aria-label']==='Create workspace').props.onSelect();
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
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props['data-workspace-id']==='w').props.onSelect();
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
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props['data-workspace-id']==='other').props.onSelect();assert.equal(ui.store.currentWorkspaceId,'w');
 assert.equal(ui.calls.filter(c=>c==='confirm').length,3);
});

test('the measured viewport publisher stays stable across ordinary shell renders',()=>{
 const ui=harness({companies:{resources:[{id:'section',name:'Delivery',parentId:null,workspaceId:null,capabilities:['read']}]}});
 const first=ui.render().find(n=>n.type==='CanvasFlow').props.onViewportWidthChange;
 first(360);const second=ui.render().find(n=>n.type==='CanvasFlow').props.onViewportWidthChange;
 assert.equal(second,first);second(360);assert.equal(ui.render().find(n=>n.type==='CanvasFlow').props.onViewportWidthChange,first);
});

test('phone utility menu uses the existing guarded management and refresh actions',async()=>{
 const ui=harness();const tree=ui.render();
 assert.ok(tree.some(n=>n.type==='Button'&&n.props['aria-label']==='Canvas menu'));
 await tree.find(n=>n.type==='DropdownMenuItem'&&n.props.children?.includes('Refresh canvas')).props.onSelect();
 assert.ok(ui.calls.includes('refresh-workspaces'));
 ui.render().find(n=>n.type==='DropdownMenuItem'&&n.props.children?.includes('Manage canvas')).props.onSelect();
 assert.equal(ui.render().filter(n=>n.type==='Dialog').at(-1).props.open,true);
});
test('phone locations expose authorized full paths and canonical navigation',()=>{
 const company={id:'co',kind:'organization',name:'Acme',parentId:null,workspaceId:null,capabilities:['read']};const section={id:'sec',kind:'section',name:'Payments',parentId:'co',workspaceId:null,capabilities:['read']};
 const ui=harness({companies:{resources:[company,section]}});ui.render().find(n=>n.type==='CanvasFlow').props.onOpenResource('sec');
 const tree=ui.render(), current=tree.find(n=>n.type==='Button'&&n.props['aria-label']==='Canvas location: Payments');
 assert.equal(current.props['aria-current'],'location');
 const parent=tree.find(n=>n.type==='DropdownMenuItem'&&n.props['data-canvas-label']==='Acme');
 assert.equal(parent.props.children,'Canvas / Acme');parent.props.onSelect();
 assert.deepEqual(ui.render().find(n=>n.type==='CanvasFlow').props.focus,{kind:'resource',resourceId:'co'});
});

test('work focus preserves the canvas and task draft when returning to the map',()=>{
 const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};
 const ui=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'},graph:{entry:{workspace,complete:true,graph:{tasks:[],dependencies:[],timezone:'UTC',asOf:'2026-11-13T12:00:00Z'}}}});
 ui.render().find(n=>n.type==='CanvasFlow').props.onOpen({kind:'workspace',workspaceId:'w'});
 ui.render().find(n=>n.type==='Button'&&n.props['aria-label']==='Open workspace tools').props.onClick();
 ui.render().find(n=>n.type==='select'&&n.props['aria-label']==='Workspace tools').props.onChange({target:{value:'tasks'}});
 ui.render().find(n=>n.type==='WorkspaceBoard').props.onDirtyChange(true);
 const work=ui.render(),back=work.find(n=>n.type==='Button'&&n.props['aria-label']==='Show canvas');
 assert.ok(back,'the working surface must provide a clear return to the canvas');
 assert.ok(work.some(n=>n.type==='CanvasFlow'),'canvas must stay mounted during work');
 const pane=work.find(n=>n.type==='aside');assert.ok(pane.props.className.split(' ').includes('top-0'));
 back.props.onClick();const map=ui.render();
 assert.ok(map.some(n=>n.type==='CanvasFlow'));assert.ok(map.some(n=>n.type==='WorkspaceBoard'),'hidden draft stays mounted');
 assert.equal(map.find(n=>n.type==='CanvasFlow').props.focus.kind,'workspace');
});

test('one canonical location control replaces competing workspace and breadcrumb pickers',()=>{
 const workspace={id:'w',name:'Delivery',ownerId:'actor@example.test',members:[]};
 const tree=harness({store:{workspaces:[workspace],currentWorkspaceId:'w'}}).render();
 assert.equal(tree.filter(n=>n.type==='Button'&&n.props['aria-label']?.startsWith('Canvas location:')).length,1);
 assert.equal(tree.some(n=>n.type==='select'&&n.props['aria-label']==='Current workspace'),false);
 assert.ok(tree.some(n=>n.type==='DropdownMenuItem'&&n.props['data-workspace-id']==='w'));
 assert.equal(tree.filter(n=>n.type==='nav'&&n.props['aria-label']==='Canvas hierarchy').length,1);
});
