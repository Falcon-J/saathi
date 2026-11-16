const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),ts=require('typescript')
const {deriveNextWork}=require('../../lib/next-work.ts')
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
function harness(extra={}){
 const slots=[];let cursor=0
 const react={useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},useMemo:f=>f(),useEffect:f=>f()}
 const jsx=(type,props)=>({type,props}),exports={},calls=[]
 const deps={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/ui/button':{Button:'Button'},'@/components/ui/input':{Input:'Input'},'@/components/next-work-view':{NextWorkView:'NextWorkView'},'@/lib/identity':require('../../lib/identity.ts'),'@/lib/task-time':require('../../lib/task-time.ts')}
 const code=ts.transpileModule(fs.readFileSync('components/canvas/canvas-task-panel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','exports',code)(name=>{assert.ok(name in deps,name);return deps[name]},exports)
 const tasks=['scope','build','done'].map((id,i)=>({id,workspaceId:'w',title:id,status:i===2?'done':'todo',completed:i===2,createdBy:'owner@example.test',priority:'medium',createdAt:'2026-11-16T00:00:00Z',updatedAt:'2026-11-16T00:00:00Z',version:1}))
 const dependencies=[{workspaceId:'w',prerequisiteTaskId:'scope',dependentTaskId:'build'}]
 const props={workspace:{id:'w',name:'W',timezone:'UTC',members:[],ownerId:'owner@example.test'},tasks,dependencies,readiness:deriveNextWork(tasks,dependencies,'UTC',new Date('2026-11-16')),selectedTask:null,group:null,onGroupChange:g=>calls.push(['group',g]),onInspect:id=>calls.push(['inspect',id]),onEdit:id=>calls.push(['edit',id]),onCreate:()=>calls.push('create'),onBack:()=>calls.push('back'),onComplete:()=>calls.push('complete'),canCreate:true,canEdit:true,canComplete:true,busy:false,currentUserEmail:'owner@example.test',refreshSignal:0,onChanged:async()=>{},...extra}
 return {props,calls,render(){cursor=0;return nodes(exports.CanvasTaskPanel(props))}}
}
test('active quick-add keeps only one task-creation entry',()=>{
 const ui=harness({creating:true});assert.equal(ui.render().some(node=>node.type==='Button'&&node.props.children==='New task'),false)
 ui.props.creating=false;assert.equal(ui.render().some(node=>node.type==='Button'&&node.props.children==='New task'),true)
})

test('one task list filters canonical ready, waiting and completed work',()=>{
 const ui=harness();let tree=ui.render();assert.equal(tree.filter(n=>n.props?.['data-task-row']).length,3)
 const filter=tree.find(n=>n.type==='select');filter.props.onChange({target:{value:'waiting'}});assert.deepEqual(ui.calls,[['group','waiting']])
 ui.props.group='waiting';assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['build'])
 ui.props.group='completed';assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['done'])
})
test('selected task retains prerequisite navigation inside details and explicit edit without another task list',()=>{
 const ui=harness();ui.props.selectedTask=ui.props.tasks[1];const tree=ui.render()
 assert.equal(tree.filter(n=>n.props?.['data-task-row']).length,0)
 tree.find(n=>n.type==='details').props.onToggle({currentTarget:{open:true}});ui.render().find(n=>n.type==='NextWorkView').props.onOpenTask('scope');assert.deepEqual(ui.calls,[['inspect','scope']])
 tree.find(n=>n.props?.children==='Edit task').props.onClick();assert.deepEqual(ui.calls.at(-1),['edit','build'])
 ui.props.canEdit=false;ui.props.canComplete=false;assert.equal(ui.render().some(n=>n.props?.children==='Edit task'),false)
})
test('full authorized search stays bounded and can find a late task',()=>{
 const ui=harness();ui.props.tasks=Array.from({length:750},(_,i)=>({...ui.props.tasks[0],id:'t'+i,title:'Task '+i}));ui.props.readiness=deriveNextWork(ui.props.tasks,[],'UTC',new Date())
 assert.equal(ui.render().filter(n=>n.props?.['data-task-row']).length,50)
 ui.render().find(n=>n.type==='Input').props.onChange({target:{value:'Task 749'}})
 assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['t749'])
})

test('Task details lazily reuses the existing scoped prerequisite inspector',()=>{const ui=harness();ui.props.selectedTask=ui.props.tasks[1];let tree=ui.render();assert.equal(tree.some(n=>n.type==='NextWorkView'),false);tree.find(n=>n.type==='details').props.onToggle({currentTarget:{open:true}});tree=ui.render();const inspector=tree.find(n=>n.type==='NextWorkView');assert.equal(inspector.props.inspectorOnly,true);assert.equal(inspector.props.initialTaskId,'build');assert.equal(inspector.props.workspace,ui.props.workspace);assert.equal(inspector.props.currentUserEmail,ui.props.currentUserEmail)})

const visibleNodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(visibleNodes):[n,...(n.type==='details'?[]:visibleNodes(n.props?.children))]
test('compact inspector hides empty metadata and duplicate dependency lists under Task details',()=>{
 const ui=harness();ui.props.selectedTask=ui.props.tasks[1];const root=ui.render()[0],visible=visibleNodes(root);
 assert.equal(nodes(root).find(n=>n.type==='summary').props.children,'Task details');
 assert.equal(visible.some(n=>n.props?.['aria-label']==='Waiting for'||n.props?.['aria-label']==='Needed by'),false);
 assert.equal(visible.some(n=>n.type==='dt'&&['Assignee','Due'].includes(n.props.children)),false);
 assert.match(JSON.stringify(visible.filter(n=>n.type==='p')),/1 blocker/);
 const details=nodes(root).find(n=>n.type==='details');assert.match(JSON.stringify(details),/Unassigned/);assert.match(JSON.stringify(details),/No date/);
})
test('compact inspector retains populated ownership and deadlines and read-only actions',()=>{
 const ui=harness({canEdit:false,canComplete:false});ui.props.tasks[1].assigneeEmail='member@example.test';ui.props.tasks[1].dueDate='2026-11-20';ui.props.workspace.members=[{id:'member',email:'member@example.test',username:'Priya'}];ui.props.selectedTask=ui.props.tasks[1];
 const visible=visibleNodes(ui.render()[0]);assert.ok(visible.some(n=>n.type==='dd'&&n.props.children==='Priya'));assert.ok(visible.some(n=>n.type==='dt'&&n.props.children==='Due'));
 assert.equal(visible.some(n=>n.props?.children==='Mark done'),false);visible.find(n=>n.props?.children==='Details').props.onClick();assert.deepEqual(ui.calls,[['edit','build']]);
})
