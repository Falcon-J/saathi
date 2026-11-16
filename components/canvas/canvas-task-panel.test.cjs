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
test('one task list filters canonical ready, waiting and completed work',()=>{
 const ui=harness();let tree=ui.render();assert.equal(tree.filter(n=>n.props?.['data-task-row']).length,3)
 const filter=tree.find(n=>n.type==='select');filter.props.onChange({target:{value:'waiting'}});assert.deepEqual(ui.calls,[['group','waiting']])
 ui.props.group='waiting';assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['build'])
 ui.props.group='completed';assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['done'])
})
test('selected task exposes blockers and explicit edit without another task list',()=>{
 const ui=harness();ui.props.selectedTask=ui.props.tasks[1];const tree=ui.render()
 assert.equal(tree.filter(n=>n.props?.['data-task-row']).length,0)
 const blocker=tree.find(n=>n.props?.['aria-label']==='Open prerequisite scope');blocker.props.onClick();assert.deepEqual(ui.calls,[['inspect','scope']])
 tree.find(n=>n.props?.children==='Edit task').props.onClick();assert.deepEqual(ui.calls.at(-1),['edit','build'])
 ui.props.canEdit=false;ui.props.canComplete=false;assert.equal(ui.render().some(n=>n.props?.children==='Edit task'),false)
})
test('full authorized search stays bounded and can find a late task',()=>{
 const ui=harness();ui.props.tasks=Array.from({length:750},(_,i)=>({...ui.props.tasks[0],id:'t'+i,title:'Task '+i}));ui.props.readiness=deriveNextWork(ui.props.tasks,[],'UTC',new Date())
 assert.equal(ui.render().filter(n=>n.props?.['data-task-row']).length,50)
 ui.render().find(n=>n.type==='Input').props.onChange({target:{value:'Task 749'}})
 assert.deepEqual(ui.render().filter(n=>n.props?.['data-task-row']).map(n=>n.props['data-task-row']),['t749'])
})
