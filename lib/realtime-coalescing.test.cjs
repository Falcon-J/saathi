const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const exportsUnderTest = {}
const js = ts.transpileModule(fs.readFileSync('lib/realtime.ts','utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText
new Function('require','exports',js)(()=>({}),exportsUnderTest)
const { createRawStreamReader } = exportsUnderTest

test('identical concurrent and recent raw reads share transport but return isolated values', async()=>{
 let calls=0, now=0, release
 const read=createRawStreamReader(async key=>{calls++; await new Promise(r=>{release=r}); return [{key,fields:{value:'original'}}]}, {now:()=>now})
 const a=read('a'), b=read('a'); await new Promise(setImmediate); assert.equal(calls,1); release()
 const [x,y]=await Promise.all([a,b]); x[0].fields.value='changed'; assert.equal(y[0].fields.value,'original')
 now=99; assert.equal((await read('a'))[0].fields.value,'original'); assert.equal(calls,1)
 now=100; const next=read('a'); await new Promise(setImmediate); assert.equal(calls,2); release(); await next
})
test('keys isolate workspace cursor and count and failures are immediately retried', async()=>{
 let calls=0
 const read=createRawStreamReader(async key=>{calls++; if(key==='fail')throw Error('offline'); return key})
 assert.deepEqual(await Promise.all(['a/1/50','b/1/50','a/2/50','a/1/10'].map(read)),['a/1/50','b/1/50','a/2/50','a/1/10'])
 assert.equal(calls,4); await assert.rejects(read('fail')); await assert.rejects(read('fail')); assert.equal(calls,6)
})
test('completed entries expire from dispatch time, including empty stream reads',async()=>{
 let now=0,calls=0
 const read=createRawStreamReader(async()=>{calls++; now+=101; return []},{now:()=>now})
 await read('a'); await read('a'); assert.equal(calls,2)
})
test('entry and byte limits evict cached values and oversized results are not retained',async()=>{
 let calls=0
 const read=createRawStreamReader(async key=>{calls++; return key==='large'?'x'.repeat(100):key},{maxEntries:2,maxBytes:12,maxEntryBytes:10})
 await read('a');await read('b');await read('c');await read('a');assert.equal(calls,4)
 await read('large');await read('large');assert.equal(calls,6)
 const bytes=createRawStreamReader(async key=>{calls++;return key},{maxBytes:6,maxEntryBytes:6})
 await bytes('aaa');await bytes('bbb');await bytes('aaa');assert.equal(calls,9)
})

test('replay bounds share only in-flight reads and immediately refresh completed snapshots',async()=>{
 let calls=0,release
 const read=createRawStreamReader(async()=>{calls++;await new Promise(r=>{release=r});return {latestId:String(calls)}},{retentionMs:0})
 const a=read('workspace'),b=read('workspace');await new Promise(setImmediate);assert.equal(calls,1);release();await Promise.all([a,b]);
 const c=read('workspace');await new Promise(setImmediate);assert.equal(calls,2);release();assert.equal((await c).latestId,'2')
})

test('serialization failure is evicted before the next transport attempt',async()=>{
 let calls=0;const read=createRawStreamReader(async()=>++calls===1?1n:'recovered');
 await assert.rejects(read('a'),TypeError);assert.equal(await read('a'),'recovered');assert.equal(calls,2)
})
test('an evicted old pending failure cannot delete the replacement for its key',async()=>{
 const pending=[];let calls=0;const read=createRawStreamReader(async key=>{calls++;return new Promise((resolve,reject)=>pending.push({key,resolve,reject}))},{maxEntries:1})
 const old=read('a');const oldFailure=assert.rejects(old,/offline/);await new Promise(setImmediate);
 const other=read('b');await new Promise(setImmediate);const replacement=read('a');await new Promise(setImmediate);
 pending[0].reject(Error('offline'));await oldFailure;pending[1].resolve('b');pending[2].resolve('new');
 assert.deepEqual(await Promise.all([other,replacement]),['b','new']);assert.equal(await read('a'),'new');assert.equal(calls,3)
})
test('service coalesces identical stream transport and refreshes completed replay bounds',async()=>{
 let streamCalls=0,boundsCalls=0;const loaded={};
 const deps={'./redis.ts':{redis:{}},'./redis-streams.ts':{streamService:{xread:async()=>{streamCalls++;return []},getStreamBounds:async()=>({oldestId:'1-0',latestId:String(++boundsCalls)+'-0'})}},'./realtime-event.ts':{}};
 new Function('require','exports',js)(name=>deps[name],loaded);const service=loaded.realtimeService;
 await Promise.all([service.readNewEvents('a','1-0',50),service.readNewEvents('a','1-0',50)]);assert.equal(streamCalls,1);
 await service.readNewEvents('a','2-0',50);await service.readNewEvents('b','1-0',50);await service.readNewEvents('a','1-0',10);assert.equal(streamCalls,4);
 await Promise.all([service.getStreamBounds('a'),service.getStreamBounds('a')]);assert.equal(boundsCalls,1);
 assert.equal((await service.getStreamBounds('a')).latestId,'2-0');assert.equal(boundsCalls,2)
})

test('undefined transport results fail without retaining a rejected snapshot',async()=>{
 let calls=0;const read=createRawStreamReader(async()=>++calls===1?undefined:[]);
 await assert.rejects(read('a'),/not JSON data/);assert.deepEqual(await read('a'),[]);assert.equal(calls,2)
})
