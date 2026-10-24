import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { getDb } from "../db/client.ts"
import { createWorkspaceRecord } from "./workspaces.ts"
import { listTaskRecordsPage, getTaskAggregates, getTaskRecord } from "./tasks.ts"
import { encodeTaskCursor, normalizeTaskPage } from "../task-page.ts"

test("task pages traverse 137 tied tasks, search full scope and recheck authorization", {skip:!process.env.DATABASE_TEST_URL},async () => {
  process.env.DATABASE_URL=process.env.DATABASE_TEST_URL
  const db=getDb(),owner=randomUUID(),member=randomUUID(),other=randomUUID()
  await db`INSERT INTO auth.users (id,email) VALUES (${owner},${owner+'@example.test'}),(${member},${member+'@example.test'}),(${other},${other+'@example.test'})`
  const workspace=await createWorkspaceRecord(owner,{name:"Task pages"})
  const foreign=await createWorkspaceRecord(other,{name:"Other task pages"})
  try {
    await db`INSERT INTO workspace_members(workspace_id,user_id) VALUES (${workspace.id},${member})`
    const ids=Array.from({length:137},()=>randomUUID()).sort()
    await db`INSERT INTO tasks ${db(ids.map((id,index)=>({id,workspace_id:workspace.id,title:index===136?'Needle task':'Task '+index,description:index===135?'description match':null,status:index%3===0?'done':index%3===1?'todo':'in_progress',priority:index%3===0?'high':index%3===1?'low':'medium',created_by_user_id:owner,assignee_user_id:index===136?member:null,created_at:'2026-10-04T00:00:00.123456Z',due_date:'2000-01-01'})))}`
    const seen:string[]=[];let cursor:string|undefined;let firstCursor=''
    do {const page=await listTaskRecordsPage(member,workspace.id,{cursor});assert.ok(page.tasks.length<=50);seen.push(...page.tasks.map(task=>task.id));cursor=page.nextCursor??undefined;if(!firstCursor)firstCursor=cursor!}while(cursor)
    assert.deepEqual(seen,ids);assert.equal(new Set(seen).size,137)
    assert.deepEqual((await listTaskRecordsPage(member,workspace.id,{search:'NEEDLE',status:'active',priority:'low',assigneeEmail:member+'@example.test'})).tasks.map(task=>task.id),[ids[136]])
    assert.equal((await listTaskRecordsPage(member,workspace.id,{search:'description match'})).tasks[0].id,ids[135])
    const counts=await getTaskAggregates(member,workspace.id)
    assert.deepEqual(counts,{total:137,open:91,done:46,overdue:91,byStatus:{todo:46,'in-progress':45,done:46},byPriority:{low:46,medium:45,high:46}})
    // Test calendar deadlines at both date extremes, independent of the server/session timezone.
    await db`UPDATE tasks SET due_date=(now() AT TIME ZONE 'UTC')::date WHERE workspace_id=${workspace.id}`
    for(const timezone of ['Pacific/Kiritimati','Pacific/Pago_Pago']) {
      await db`UPDATE workspaces SET timezone=${timezone} WHERE id=${workspace.id}`
      const [date]=await db`SELECT ((now() AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE ${timezone})::date) AS overdue`
      assert.equal((await getTaskAggregates(member,workspace.id)).overdue,date.overdue?91:0)
    }
    assert.equal((await getTaskRecord(member,workspace.id,ids[136])).title,'Needle task')
    await assert.rejects(listTaskRecordsPage(member,workspace.id,{cursor:firstCursor,status:'active'}),/Invalid task page/)
    await assert.rejects(listTaskRecordsPage(member,workspace.id,{cursor:encodeTaskCursor(workspace.id,normalizeTaskPage(),randomUUID())}),/cursor unavailable/)
    await assert.rejects(listTaskRecordsPage(other,foreign.id,{cursor:firstCursor}),/Invalid task page/)
    await assert.rejects(getTaskRecord(member,foreign.id,ids[0]),/access denied/)
    await assert.rejects(listTaskRecordsPage(other,workspace.id),/access denied/)
    // Distinct stored microseconds collapse in the JS projection. Pagination must still compare SQL timestamps.
    await db`UPDATE tasks SET created_at='2026-10-04T00:00:00.123457Z' WHERE id=${ids[136]}`
    const newest=await listTaskRecordsPage(member,workspace.id,{limit:1})
    assert.equal(newest.tasks[0].id,ids[136])
    assert.equal((await listTaskRecordsPage(member,workspace.id,{limit:1,cursor:newest.nextCursor!})).tasks[0].id,ids[0])
    await db`UPDATE workspaces SET archived_at=now() WHERE id=${workspace.id}`
    assert.equal((await getTaskAggregates(member,workspace.id)).total,137)
    await db`UPDATE tasks SET assignee_user_id=NULL WHERE workspace_id=${workspace.id} AND assignee_user_id=${member}`
    await db`DELETE FROM workspace_members WHERE workspace_id=${workspace.id} AND user_id=${member}`
    await assert.rejects(listTaskRecordsPage(member,workspace.id,{cursor:firstCursor}),/access denied/)
    await assert.rejects(getTaskAggregates(member,workspace.id),/access denied/)
    await assert.rejects(getTaskRecord(member,workspace.id,ids[0]),/access denied/)
  } finally {
    await db`DELETE FROM workspaces WHERE id IN (${workspace.id},${foreign.id})`
    await db`DELETE FROM outbox_events WHERE payload->>'userId' IN (${owner},${member},${other})`
    await db`DELETE FROM activity_events WHERE actor_user_id IN (${owner},${member},${other})`
    await db`DELETE FROM profiles WHERE id IN (${owner},${member},${other})`
    await db`DELETE FROM auth.users WHERE id IN (${owner},${member},${other})`
  }
})
