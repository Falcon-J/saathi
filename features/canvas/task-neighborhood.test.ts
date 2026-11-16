import assert from 'node:assert/strict'
import test from 'node:test'
import { taskNeighborhood } from './task-neighborhood.ts'

const tasks = ['scope','design','build','test','copy'].map(id => ({id}))
const dependencies = [['scope','design'],['design','build'],['build','test']].map(([prerequisiteTaskId,dependentTaskId]) => ({prerequisiteTaskId,dependentTaskId}))

test('focus contains only the selected task and unfinished direct blockers', () => {
  const result=taskNeighborhood(tasks,dependencies,'build')
  assert.deepEqual(new Set(result.ids),new Set(['design','build']))
  assert.ok(result.levels.get('design')!<result.levels.get('build')!)
  assert.equal(result.levels.has('test'),false)
  assert.equal(result.omittedCount,0)
})
test('many direct blockers stay bounded without omitting the selected task', () => {
  const many=Array.from({length:750},(_,i)=>({id:String(i).padStart(3,'0')}))
  const edges=many.slice(0,50).map(t=>({prerequisiteTaskId:t.id,dependentTaskId:'700'}))
  const result=taskNeighborhood(many,edges,'700')
  assert.equal(result.ids.length,40)
  assert.ok(result.ids.includes('700'))
  assert.ok(result.ids.includes('000'))
  assert.equal(result.omittedCount,11)
  assert.deepEqual(taskNeighborhood([...many].reverse(),[...edges].reverse(),'700'),result)
})
test('cycles and missing endpoints cannot loop or invent records',()=>{
  const result=taskNeighborhood(tasks,[...dependencies,{prerequisiteTaskId:'build',dependentTaskId:'scope'},{prerequisiteTaskId:'absent',dependentTaskId:'build'}],'build')
  assert.ok(result.ids.length<=tasks.length)
  assert.ok(!result.ids.includes('absent'))
  assert.deepEqual(taskNeighborhood(tasks,dependencies,'missing').ids,[])
})

test('completion hides blockers and reopening restores them without hiding the selected completed task',()=>{
  for(const done of [{completed:true},{status:'done'}]){
    const changed=tasks.map(t=>t.id==='design'?{...t,...done}:t)
    assert.deepEqual(taskNeighborhood(changed,dependencies,'build').ids,['build'])
  }
  const reopened=tasks.map(t=>({...t,status:'todo',completed:false}))
  assert.deepEqual(new Set(taskNeighborhood(reopened,dependencies,'build').ids),new Set(['build','design']))
  assert.deepEqual(new Set(taskNeighborhood(tasks.map(t=>t.id==='build'?{...t,completed:true}:t),dependencies,'build').ids),new Set(['build','design']))
})
