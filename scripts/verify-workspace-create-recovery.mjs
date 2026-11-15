import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {expect as baseExpect} from '@playwright/test'
const expect=baseExpect.configure({timeout:30000})
/** Drop the real committed response, then recover through a fresh browser document. */
export async function verifyWorkspaceCreationRecovery({page,db,workspace,actorId,email,base,bridge,log,deferCleanup}){
 const name='Creation recovery '+randomUUID(),requests=[]
 let interrupted=false,commandId
 const capture=request=>{if(request.method()==='POST'&&request.headers()['next-action']&&request.postData()?.includes(name)){const body=request.postData();requests.push(body);try{const value=JSON.parse(body);if(typeof value[2]==='string'&&/^[0-9a-f-]{36}$/.test(value[2]))commandId=value[2]}catch{}}}
 const intercept=async route=>{const request=route.request();if(!interrupted&&request.method()==='POST'&&request.headers()['next-action']&&request.postData()?.includes(name)){
  interrupted=true;const response=await route.fetch();assert.equal(response.status(),200);
  await expect.poll(async()=>(await db`SELECT id FROM workspaces WHERE owner_user_id=${actorId} AND name=${name}`).length).toBe(1);await route.abort('failed')
 }else await route.continue()}
 // The parent runs this after stopping its app server, so no late outbox worker can recreate Redis keys.
 deferCleanup(async()=>{
  const owned=await db.begin(async tx=>{
   if(commandId)await tx`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([actorId,'saathi-browser',commandId])},0))`
   const rows=await tx`SELECT id FROM workspaces WHERE owner_user_id=${actorId} AND name=${name}`
   for(const row of rows){
   await tx`DELETE FROM platform_command_receipts WHERE actor_user_id=${actorId} AND client_id='saathi-browser' AND workspace_id=${row.id}`
   await tx`DELETE FROM outbox_events WHERE workspace_id=${row.id}`;await tx`DELETE FROM activity_events WHERE workspace_id=${row.id}`
   await tx`DELETE FROM workspaces WHERE id=${row.id} AND owner_user_id=${actorId} AND name=${name}`
   }
   return rows
  })
  for(const row of owned)await bridge.command(['DEL','stream:'+row.id,'presence:'+row.id+':active','presence:'+row.id+':'+email])
  assert.equal((await db`SELECT id FROM workspaces WHERE owner_user_id=${actorId} AND name=${name}`).length,0)
  if(commandId)assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${actorId} AND client_id='saathi-browser' AND command_id=${commandId}`).length,0)
 })
 page.on('request',capture)
 try{
  await page.goto(base+'/canvas');await expect(page.getByLabel('Current workspace',{exact:true})).toHaveValue(workspace)
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Create workspace',exact:true})
  await expect(dialog.getByLabel('Workspace name',{exact:true})).toBeEnabled()
  await dialog.getByLabel('Workspace name',{exact:true}).fill(name)
  await dialog.getByLabel('Goal (optional)',{exact:true}).fill('Recover a committed creation')
  await page.route('**/canvas',intercept)
  await dialog.getByRole('button',{name:'Create workspace',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'Retry same creation',exact:true})).toBeEnabled()
  assert.equal(interrupted,true)
  commandId=await page.evaluate(({actorId,name})=>{for(const raw of Object.values(sessionStorage)){try{const value=JSON.parse(raw);if(value.actorId===actorId&&value.input?.name===name)return value.commandId}catch{}}return null},{actorId,name})
  assert.match(commandId,/^[0-9a-f-]{36}$/)
  await page.unroute('**/canvas',intercept)
  await page.reload();await expect(page.getByLabel('Current workspace',{exact:true})).toHaveValue(workspace)
  await page.getByRole('button',{name:'Create workspace',exact:true}).click()
  await expect(dialog.getByLabel('Workspace name',{exact:true})).toHaveValue(name)
  await expect(dialog.getByLabel('Workspace name',{exact:true})).toBeDisabled()
  await dialog.getByRole('button',{name:'Retry same creation',exact:true}).click()
  const rows=await db`SELECT id FROM workspaces WHERE owner_user_id=${actorId} AND name=${name}`;assert.equal(rows.length,1)
  const createdId=rows[0].id
  await expect(dialog).not.toBeVisible();await expect(page.getByLabel('Current workspace',{exact:true})).toHaveValue(createdId)
  await expect.poll(()=>requests.length).toBe(2);assert.equal(requests[0],requests[1],'Reload recovery must send the exact same action arguments')
  assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${actorId} AND client_id='saathi-browser' AND command_id=${commandId} AND workspace_id=${createdId}`).length,1)
  assert.equal((await db`SELECT id FROM activity_events WHERE workspace_id=${createdId}`).length,1)
  assert.equal((await db`SELECT id FROM outbox_events WHERE workspace_id=${createdId}`).length,1)
  assert.equal(await page.evaluate(id=>Object.values(sessionStorage).some(raw=>raw.includes(id)),commandId),false)
  await page.getByLabel('Current workspace',{exact:true}).selectOption(workspace)
  await expect(page.getByLabel('Current workspace',{exact:true})).toHaveValue(workspace)
  log({workspaceCreationRecovery:{lostCommittedResponse:true,reloadExactCommand:true,oneWorkspaceAndReceipt:true,noDuplicateEvents:true}})
 }finally{
  await page.unroute('**/canvas',intercept);page.off('request',capture)

 }
}
