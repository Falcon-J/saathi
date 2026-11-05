import assert from 'node:assert/strict'
import test from 'node:test'
import { localDateTimeToIso, formatTaskDue } from './task-time.ts'
import { buildTaskUpdate, toTaskEditorDraft } from './task-draft.ts'
for (const [zone, expected] of [['UTC','2026-11-05T09:00:00.000Z'],['Asia/Kolkata','2026-11-05T03:30:00.000Z']]) {
 test(`local input names and preserves ${zone} time`,()=>{const previous=process.env.TZ;try{process.env.TZ=zone;assert.equal(localDateTimeToIso('2026-11-05','09:00'),expected);assert.match(formatTaskDue(expected,undefined,zone)!,new RegExp(zone.replace('/','\\/')));const task={title:'Task',priority:'medium' as const,dueAt:expected};assert.deepEqual(buildTaskUpdate(task,toTaskEditorDraft(task)),{});assert.equal(toTaskEditorDraft({...task,dueAt:undefined,dueDate:'2026-11-05'}).dueDate,'2026-11-05')}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}})
}
test('DST gaps and newly ambiguous wall times cannot silently change deadlines',()=>{const previous=process.env.TZ;try{process.env.TZ='America/New_York';assert.equal(localDateTimeToIso('2026-03-08','02:30'),undefined);assert.equal(localDateTimeToIso('2026-11-01','01:30'),undefined);for(const dueAt of ['2026-11-01T05:30:00.000Z','2026-11-01T06:30:00.000Z']){const task={title:'Task',priority:'medium' as const,dueAt};assert.deepEqual(buildTaskUpdate(task,{...toTaskEditorDraft(task),title:'Changed'}),{title:'Changed'})}}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}})
