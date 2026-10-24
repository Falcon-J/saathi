const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}}
const totals={total:137,open:100,done:37,overdue:2,byStatus:{todo:80,'in-progress':20,done:37},byPriority:{low:30,medium:90,high:17}}
function fixture(overrides={}){
 const slots=[];let cursor=0,effects=[]
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
 const effect=(layout)=>(fn,deps)=>{const i=cursor++;if(!same(slots[i]?.deps,deps)){slots[i]?.cleanup?.();slots[i]={deps,fn,layout};effects.push(()=>slots[i].cleanup=fn())}}
 const react={useState(initial){const i=cursor++;slots[i]??={value:initial};return [slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},useRef(initial){const i=cursor++;slots[i]??={current:initial};return slots[i]},useCallback(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn},useEffect:effect(false),useLayoutEffect:effect(true)}
 const api={getTasksPage:async()=>({success:true,tasks:[{id:'first'}],nextCursor:'next'}),getWorkspaceTaskAggregates:async()=>({success:true,aggregates:totals}),...overrides}
 const js=ts.transpileModule(fs.readFileSync('hooks/use-task-board.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,exports={};new Function('require','exports',js)(name=>name==='react'?react:api,exports)
 return {render(signal=0,workspaceId='workspace'){cursor=0;const r=exports.useTaskBoard(workspaceId,signal);const pending=effects;effects=[];pending.forEach(fn=>fn());return r},replayLayoutEffects(){for(const slot of slots){if(slot?.layout){slot.cleanup?.();slot.cleanup=slot.fn()}}},unmount(){slots.forEach(s=>s?.cleanup?.())}}
}

test('Suspense layout replay in the same scope lets the pending Board load settle',async()=>{
 const page=deferred(),aggregates=deferred();let pageCalls=0,totalCalls=0
 const ui=fixture({getTasksPage:()=>{pageCalls++;return page.promise},getWorkspaceTaskAggregates:()=>{totalCalls++;return aggregates.promise}})
 ui.render()
 // Suspense hides and reveals mounted content by replaying layout effects without rerunning unchanged passive effects.
 ui.replayLayoutEffects()
 assert.equal(ui.render().loading,true)
 assert.equal(pageCalls,1);assert.equal(totalCalls,1)
 page.resolve({success:true,tasks:[{id:'resolved'}],nextCursor:null})
 aggregates.resolve({success:true,aggregates:totals})
 await tick()
 const state=ui.render()
 assert.equal(state.loading,false,'same-scope layout replay must not invalidate the only pending load')
 assert.deepEqual(state.tasks,[{id:'resolved'}]);assert.equal(state.aggregates,totals);assert.equal(state.error,null)
})

test('Board uses server filters and whole workspace totals, ignoring a stale first page',async()=>{
 const slow=deferred();const calls=[]
 const ui=fixture({getTasksPage:async(_,input)=>{calls.push(input);return input.search==='needle'?{success:true,tasks:[{id:'needle'}],nextCursor:null}:slow.promise}})
 ui.render().changeFilters({search:'needle'});ui.render();await tick()
 slow.resolve({success:true,tasks:[{id:'wrong'}],nextCursor:'old'});await tick()
 const state=ui.render();assert.deepEqual(state.tasks,[{id:'needle'}]);assert.equal(state.aggregates.total,137);assert.equal(state.nextCursor,null);assert.equal(calls[1].search,'needle');assert.equal(calls[1].limit,50)
})
test('Load more deduplicates rows and concurrent clicks; a scope change rejects its stale response',async()=>{
 const slow=deferred();let calls=0
 const ui=fixture({getTasksPage:async(_,input)=>{calls++;return input.cursor?slow.promise:{success:true,tasks:[{id:'one'}],nextCursor:'next'}}})
 ui.render();await tick();let state=ui.render();const first=state.loadMore();await state.loadMore();assert.equal(calls,2)
 slow.resolve({success:true,tasks:[{id:'one'},{id:'two'}],nextCursor:null});await first
 assert.deepEqual(ui.render().tasks.map(t=>t.id),['one','two'])
})
test('failed refresh retains the loaded page and signals failed reconciliation',async()=>{
 let failing=false;const ui=fixture({getTasksPage:async()=>failing?{error:'Offline'}:{success:true,tasks:[{id:'one'}],nextCursor:null}})
 ui.render();await tick();failing=true;assert.equal(await ui.render().reload(),false);assert.deepEqual(ui.render().tasks,[{id:'one'}]);assert.equal(ui.render().error,'Offline')
})
test('late page cannot overwrite a new filter and old callbacks cannot reload it',async()=>{
 const slow=deferred();const calls=[];const ui=fixture({getTasksPage:async(_,input)=>{calls.push(input);return input.cursor?slow.promise:{success:true,tasks:[{id:input.search||'one'}],nextCursor:'next'}}})
 ui.render();await tick();const old=ui.render();const pending=old.loadMore();old.changeFilters({search:'new'});ui.render();await tick();slow.resolve({success:true,tasks:[{id:'wrong'}],nextCursor:null});await pending
 assert.deepEqual(ui.render().tasks,[{id:'new'}]);const before=calls.length;assert.equal(await old.reload(),false);assert.equal(calls.length,before)
})

test('workspace changes reject the previous page, totals and reload callback',async()=>{
 const page=deferred(),aggregates=deferred();const calls=[]
 const ui=fixture({getTasksPage:async(id)=>{calls.push(id);return id==='workspace'?page.promise:{success:true,tasks:[{id:'new-workspace'}],nextCursor:null}},getWorkspaceTaskAggregates:async(id)=>id==='workspace'?aggregates.promise:{success:true,aggregates:{...totals,total:1}}})
 const old=ui.render();ui.render(0,'other-workspace');await tick()
 page.resolve({success:true,tasks:[{id:'wrong'}],nextCursor:'old'})
 aggregates.resolve({success:true,aggregates:totals});await tick()
 const state=ui.render(0,'other-workspace')
 assert.equal(state.loading,false);assert.deepEqual(state.tasks,[{id:'new-workspace'}]);assert.equal(state.aggregates.total,1)
 assert.equal(await old.reload(),false);assert.deepEqual(calls,['workspace','other-workspace'])
})

test('unmount rejects pending Board data and reload callbacks',async()=>{
 const page=deferred();let calls=0
 const ui=fixture({getTasksPage:()=>{calls++;return page.promise}})
 const old=ui.render();ui.unmount();page.resolve({success:true,tasks:[{id:'wrong'}],nextCursor:null});await tick()
 const state=ui.render()
 assert.deepEqual(state.tasks,[]);assert.equal(state.aggregates,null);assert.equal(await old.reload(),false);assert.equal(calls,1)
})
