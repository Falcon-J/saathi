const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
const modules = {}
function load(file, dependencies) {
 const exports = {}
 new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>{assert.ok(name in dependencies,name);return dependencies[name]},exports)
 return exports
}
const storage = new Map()
global.sessionStorage = { getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key) }
modules.storage = load('lib/draft-storage.ts',{})
const jsx=(type,props)=>({type,props})
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
function mount(component, props, actions={}) {
 const slots=[];let cursor=0, changed=false, effects=[]
 const react={memo:c=>c,useMemo:f=>f(),useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(next!==slots[i]){slots[i]=next;changed=true}}]},useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i]},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;effects.push(fn)}}}
 const time=load('lib/task-time.ts',{})
 const draft=load('lib/task-draft.ts',{'./task-time.ts':time})
 const components=['button','input','textarea','card','badge','dialog','label']
 const deps={'@/lib/capability-ceiling':load('lib/capability-ceiling.ts',{}),react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/draft-storage':modules.storage,'@/lib/task-time':time,'@/lib/task-draft':draft,'lucide-react':{},'@/app/actions/workspaces':{updateWorkspaceSettings:async(...args)=>({workspace:await (actions.updateWorkspace??(async(id,fields,version)=>({...props.workspace,...fields,version:version+1})))(...args)})},'@/app/tasks/actions':{getTaskById:async()=>({error:'unused'})},'@/lib/mutation-result':{getMutationError:r=>r?.error},'@/hooks/usePermissions':{useTaskPermissions:()=>({canEdit:true})}}
 for(const c of components)deps['@/components/ui/'+c]=Object.fromEntries(['Button','Input','Textarea','Card','Badge','Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle','Label'].map(n=>[n,n]))
 for(const c of ['TaskQuickAdd','ConfirmDialog','TaskFilter','TaskComments'])deps['@/components/'+c.replace(/[A-Z]/g,(m,i)=>(i?'-':'')+m.toLowerCase())]={[c]:c}
 const loaded=load(`components/${component}.tsx`,deps)
 const Component=loaded[{ 'workspace-settings':'WorkspaceSettings','task-quick-add':'TaskQuickAdd','task-list':'TaskList'}[component]]
 const ui={render(){let rows;for(let i=0;i<12;i++){cursor=0;changed=false;rows=nodes(Component(props));while(effects.length)effects.shift()();if(!changed)return rows}throw Error('render loop')},edit(id,value){ui.render().find(n=>n.props?.id===id||n.props?.['aria-label']===id).props.onChange({target:{value}})},async submit(){await ui.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});ui.render()},editor(){return ui.render().find(n=>n.type===loaded.TaskEditorDialog)}}
 return ui
}
const workspace={id:'w',name:'Original',summary:'Original goal',targetAt:null,timezone:'UTC',version:1}
test('settings remount restores dirty fields with their old baseline, then success clears storage',async()=>{
 storage.clear();const scope='account-a:workspace-w',writes=[]
 let ui=mount('workspace-settings',{workspace,draftScope:scope,onSaved:async()=>{}})
 ui.edit('settings-name','Local');ui.render()
 ui=mount('workspace-settings',{workspace:{...workspace,version:2,summary:'Remote'},draftScope:scope,onSaved:async()=>{}},{updateWorkspace:async(...args)=>{writes.push(args);return {...workspace,name:'Local',version:3}}})
 assert.equal(ui.render().find(n=>n.props?.id==='settings-name').props.value,'Local')
 await ui.submit();assert.equal(writes[0][2],1);assert.equal(storage.has(scope+':settings'),false)
})
test('quick add remount restores details and cannot leak across scopes; success clears draft',async()=>{
 storage.clear();const props={draftScope:'account-a:w',onAddTask:async()=>({})}
 let ui=mount('task-quick-add',props);ui.edit('Task title','Keep task');ui.render().find(n=>n.props?.['aria-expanded']===false).props.onClick();ui.edit('Task description','Keep description');ui.render()
 ui=mount('task-quick-add',props);assert.equal(ui.render().find(n=>n.props?.['aria-label']==='Task title').props.value,'Keep task')
 assert.equal(ui.render().find(n=>n.props?.['aria-label']==='Task description').props.value,'Keep description')
 assert.equal(mount('task-quick-add',{...props,draftScope:'account-b:w'}).render().find(n=>n.props?.['aria-label']==='Task title').props.value,'')
 assert.equal(mount('task-quick-add',{...props,draftScope:'account-a:other'}).render().find(n=>n.props?.['aria-label']==='Task title').props.value,'')
 await ui.submit();assert.equal(storage.has('account-a:w:quick-add'),false)
})
test('task editor remount retains source task version and draft; explicit close removes it',()=>{
 storage.clear();const task={id:'task',workspaceId:'w',title:'Original task',priority:'medium',completed:false,createdBy:'owner',createdAt:'2026-11-05',updatedAt:'2026-11-05',version:4}
 const props={tasks:[task],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',openTaskId:'task',draftScope:'account-a:w'}
 let ui=mount('task-list',props);ui.editor().props.onDraftChange({title:'Retained task'});ui.render()
 ui=mount('task-list',{...props,openTaskId:null,tasks:[{...task,version:5,title:'Remote task'}]})
 assert.equal(ui.editor().props.draft.title,'Retained task');assert.equal(ui.editor().props.task.version,4)
 ui.editor().props.onClose();ui.render();assert.equal(storage.has('account-a:w:task-editor'),false)
})
test('explicit workspace discard clears only its three keys; storage failure does not throw',()=>{
 storage.clear();for(const key of ['a:settings','a:quick-add','a:task-editor','b:settings'])storage.set(key,'{}')
 modules.storage.clearWorkspaceDrafts('a');assert.deepEqual([...storage.keys()],['b:settings'])
 const original=global.sessionStorage;try{global.sessionStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};assert.doesNotThrow(()=>modules.storage.clearWorkspaceDrafts('a'));assert.doesNotThrow(()=>mount('task-quick-add',{draftScope:'a',onAddTask:async()=>({})}).render())}finally{global.sessionStorage=original}
})


test('settings explicit discard removes retained fields without changing another account', async () => {
 storage.clear()
 const props={workspace,draftScope:'account-a:w',onSaved:async()=>{}}
 let ui=mount('workspace-settings',props)
 ui.edit('settings-name','Discard this');ui.render()
 assert.equal(mount('workspace-settings',{...props,draftScope:'account-b:w'}).render().find(n=>n.props?.id==='settings-name').props.value,'Original')
 ui=mount('workspace-settings',{...props,workspace:{...workspace,version:2,summary:'Remote'}})
 await ui.render().find(n=>n.type==='Button'&&n.props.children==='Review latest settings').props.onClick()
 ui.render().find(n=>n.type==='Button'&&n.props.children==='Use latest settings').props.onClick()
 ui.render();assert.equal(storage.has('account-a:w:settings'),false)
})

test('restored task editor saves against original version and clears only after success', async () => {
 storage.clear()
 const task={id:'task',workspaceId:'w',title:'Original task',priority:'medium',completed:false,createdBy:'owner',createdAt:'2026-11-05',updatedAt:'2026-11-05',version:4}
 const props={tasks:[task],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',openTaskId:'task',draftScope:'account-a:w'}
 let ui=mount('task-list',props);ui.editor().props.onDraftChange({title:'Retained task'});ui.render()
 assert.equal(mount('task-list',{...props,draftScope:'account-b:w',openTaskId:null}).editor().props.task,null)
 const writes=[]
 ui=mount('task-list',{...props,openTaskId:null,onEditTask:async(...args)=>{writes.push(args);return {success:true}}})
 await ui.editor().props.onSubmit({preventDefault(){}})
 ui.render();assert.equal(writes[0][2],4);assert.equal(storage.has('account-a:w:task-editor'),false)
})

test('corrupt stored draft is ignored and removed',()=>{
 storage.clear();storage.set('account-a:w:quick-add','{"title":false}')
 const ui=mount('task-quick-add',{draftScope:'account-a:w',onAddTask:async()=>({})})
 assert.equal(ui.render().find(n=>n.props?.['aria-label']==='Task title').props.value,'')
 assert.equal(storage.has('account-a:w:quick-add'),false)
})

test('invalid settings baseline and task snapshots cannot enter component state',()=>{
 storage.clear()
 storage.set('a:w:settings',JSON.stringify({baseline:{...workspace,version:'1'},name:'Bad',summary:'',targetDate:''}))
 const settings=mount('workspace-settings',{workspace,draftScope:'a:w',onSaved:async()=>{}})
 assert.equal(settings.render().find(n=>n.props?.id==='settings-name').props.value,'Original')
 assert.equal(storage.has('a:w:settings'),false)
 storage.set('a:w:task-editor',JSON.stringify({task:{id:'task',workspaceId:'w',title:'Title',createdBy:{bad:true},createdAt:'now',updatedAt:'now',completed:false,priority:'medium'},draft:{}}))
 const board=mount('task-list',{tasks:[],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',draftScope:'a:w'})
 assert.equal(board.editor().props.task,null)
 assert.equal(storage.has('a:w:task-editor'),false)
})

test('an explicit new open request reopens the same task while ordinary refreshes preserve dismissal', () => {
 storage.clear()
 const task={id:'task',workspaceId:'w',title:'Open again',priority:'medium',completed:false,createdBy:'owner',createdAt:'2026-11-05',updatedAt:'2026-11-05',version:4}
 const props={tasks:[task],loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',openTaskId:'task',openTaskRequest:1,draftScope:'account-a:w'}
 const ui=mount('task-list',props)
 assert.equal(ui.editor().props.task.id,'task')
 ui.editor().props.onClose()
 assert.equal(ui.editor().props.task,null)
 props.tasks=[{...task,version:5}]
 assert.equal(ui.editor().props.task,null,'live data must not reopen a dismissed editor')
 props.openTaskRequest=2
 assert.equal(ui.editor().props.task.version,5,'an explicit repeat request opens the current record')
 ui.editor().props.onDraftChange({title:'Keep my edit'})
 props.tasks=[{...task,version:6}]
 assert.equal(ui.editor().props.draft.title,'Keep my edit','refreshes cannot replace an active draft')
})

test('off-page repeat open waits for its matching fresh detail instead of consuming cached fields', () => {
 storage.clear()
 const old={id:'task',workspaceId:'w',title:'Off page',description:'Old fields',priority:'medium',completed:false,createdBy:'owner',createdAt:'2026-11-05',updatedAt:'2026-11-05',version:4}
 const props={tasks:[],detailTask:old,loading:false,members:[],currentUserEmail:'owner',workspaceOwnerId:'owner',timeZone:'UTC',openTaskId:'task',openTaskRequest:1,openTaskReady:true,draftScope:'account-a:w'}
 const ui=mount('task-list',props)
 ui.editor().props.onClose();ui.render()
 props.openTaskRequest=2;props.openTaskReady=false
 assert.equal(ui.editor().props.task,null,'an unfinished authoritative read cannot reopen cached detail')
 props.tasks=[old];props.detailTask={...old,description:'Saved fields',version:5};props.openTaskReady=true
 assert.equal(ui.editor().props.task.version,5)
 assert.equal(ui.editor().props.draft.description,'Saved fields')
})
