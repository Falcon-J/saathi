import assert from 'node:assert/strict'
import test from 'node:test'
import { taskNeighborhood } from './task-neighborhood.ts'

const tasks = ['scope','design','build','test','copy'].map(id => ({id}))
const dependencies = [['scope','design'],['design','build'],['build','test']].map(([prerequisiteTaskId,dependentTaskId]) => ({prerequisiteTaskId,dependentTaskId}))

test('related work contains upstream and downstream tasks without unrelated work', () => {
  const result=taskNeighborhood(tasks,dependencies,'build',true)
  assert.deepEqual(new Set(result.ids),new Set(['scope','design','build','test']))
  assert.ok(result.levels.get('design')!<result.levels.get('build')!)
  assert.ok(result.levels.get('test')!>result.levels.get('build')!)
  assert.equal(result.omittedCount,0)
})
test('selection beyond the first forty survives a stable bounded projection', () => {
  const many=Array.from({length:750},(_,i)=>({id:String(i).padStart(3,'0')}))
  const edges=many.slice(1).map((t,i)=>({prerequisiteTaskId:many[i].id,dependentTaskId:t.id}))
  const result=taskNeighborhood(many,edges,'700',false)
  assert.equal(result.ids.length,40)
  assert.ok(result.ids.includes('700'))
  assert.ok(result.ids.includes('699'))
  assert.ok(result.ids.includes('701'))
  assert.equal(result.omittedCount,710)
  assert.deepEqual(taskNeighborhood([...many].reverse(),[...edges].reverse(),'700',false),result)
})
test('cycles and missing endpoints cannot loop or invent records',()=>{
  const result=taskNeighborhood(tasks,[...dependencies,{prerequisiteTaskId:'build',dependentTaskId:'scope'},{prerequisiteTaskId:'absent',dependentTaskId:'build'}],'build',true)
  assert.ok(result.ids.length<=tasks.length)
  assert.ok(!result.ids.includes('absent'))
  assert.deepEqual(taskNeighborhood(tasks,dependencies,'missing',true).ids,[])
})
