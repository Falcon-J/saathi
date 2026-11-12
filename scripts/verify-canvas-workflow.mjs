import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 30_000 })

/** Extends the real-Auth handoff verifier, reusing its server, users and cleanup. */
export async function verifyCanvasWorkflow({ page, member, db, workspace, users, base, accessibility, evidence, log }) {
  const companyName = `Canvas acceptance ${randomUUID()}`
  const sectionName = 'Delivery section'
  const agentRunId = randomUUID(), agentGrantId = randomUUID(), agentClientId = `canvas-browser-${randomUUID()}`
  let agentTaskId
  let companyId
  try {
    await page.goto(`${base}/canvas`)
    await expect(page.getByRole('region', { name: 'Workspace canvas', exact: true })).toBeVisible()
    const search = page.getByRole('combobox', { name: 'Search commands and tasks', exact: true })
    await expect(search).toBeEnabled()
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
    await search.fill('Publish handoff')
    await page.getByRole('option', { name: 'Publish handoff', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit task', exact: true })
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Publish handoff')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(search).toBeVisible()
    await search.fill('create')
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
    const title = `Canvas task ${randomUUID()}`
    await page.getByLabel('Task title', { exact: true }).fill(title)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM tasks WHERE workspace_id=${workspace} AND title=${title}`).length).toBe(1)
    const retainedDraft = `Canvas retained draft ${randomUUID()}`
    await page.getByLabel('Task title', { exact: true }).fill(retainedDraft)
    await expect.poll(() => page.evaluate(value => Object.values(sessionStorage).some(raw => raw.includes(value)), retainedDraft)).toBe(true)
    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
    await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(retainedDraft)
    page.once('dialog', dialog => dialog.accept())
    await page.reload()
    await expect(search).toBeEnabled()
    await search.fill('create')
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
    await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(retainedDraft)
    await page.getByLabel('Task title', { exact: true }).fill('')
    // A real persisted run is a precondition; approval itself must cross the cookie/origin action boundary.
    const [agentTask] = await db`SELECT id,version FROM tasks WHERE workspace_id=${workspace} AND title=${title}`
    agentTaskId = agentTask.id
    const originalTasks = await db`SELECT id,status,version FROM tasks WHERE workspace_id=${workspace} AND id<>${agentTaskId} ORDER BY id`
    const progress = `Prepared canvas review ${agentRunId}`
    const agentEvidence = `Acceptance evidence ${agentRunId}`
    await db.begin(async tx => {
      await tx`INSERT INTO platform_delegations(id,actor_user_id,client_id,capabilities,workspace_ids,expires_at)
        VALUES(${agentGrantId},${users[0].id},${agentClientId},${tx.json(['agent_runs:read', 'agent_runs:write'])},${tx.json([workspace])},clock_timestamp()+interval '15 minutes')`
      await tx`INSERT INTO agent_runs(id,workspace_id,task_id,actor_user_id,client_id,grant_id,state,fencing_token,lease_expires_at,progress,evidence,version)
        VALUES(${agentRunId},${workspace},${agentTaskId},${users[0].id},${agentClientId},${agentGrantId},'awaiting_review',1,clock_timestamp()+interval '15 minutes',${progress},${tx.json([{ kind: 'text', text: agentEvidence }])},4)`
      await tx`INSERT INTO task_agent_leases(workspace_id,task_id,holder_run_id,fencing_token,lease_expires_at)
        SELECT workspace_id,task_id,id,fencing_token,lease_expires_at FROM agent_runs WHERE id=${agentRunId}`
    })
    await search.fill('open workspace')
    await page.getByRole('option', { name: 'Open workspace', exact: true }).click()
    const workArea = page.getByRole('complementary', { name: 'Workspace work area', exact: true })
    await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('agents')
    const activity = page.getByRole('region', { name: 'Agent activity', exact: true })
    const run = activity.locator('article').filter({ has: activity.getByRole('heading', { name: title, exact: true }) })
    await expect(run).toContainText('Awaiting review')
    await expect(run).toContainText(progress)
    await expect(run).toContainText(agentEvidence)
    await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toHaveCount(0)
    await expect(workArea.getByRole('heading', { name: 'Ready Waiting acceptance', exact: true, level: 2 })).toBeVisible()
    await run.getByRole('button', { name: 'Follow agent', exact: true }).click()
    await expect(run.getByRole('button', { name: 'Following agent', exact: true })).toBeDisabled()
    await expect(workArea.getByRole('heading', { name: title, exact: true, level: 2 })).toBeVisible()
    await page.getByRole('button', { name: 'Stop following', exact: true }).click()
    await expect(run.getByRole('button', { name: 'Follow agent', exact: true })).toBeEnabled()
    await run.getByRole('button', { name: 'Follow agent', exact: true }).click()
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toHaveCount(0)
    await expect(run.getByRole('button', { name: 'Follow agent', exact: true })).toBeEnabled()
    await run.getByLabel('Review comment', { exact: true }).fill('Verified in the signed-in canvas')
    const reviewRequestPending = page.waitForRequest(request => request.method() === 'POST' && Boolean(request.headers()['next-action']) && Boolean(request.postData()?.includes(agentRunId)))
    await run.getByRole('button', { name: 'Approve and complete task', exact: true }).click()
    const reviewRequest = await reviewRequestPending
    const reviewHeaders = await reviewRequest.allHeaders()
    assert.equal(reviewHeaders.origin, base)
    assert.ok(reviewHeaders.authorization === undefined, 'Human review must not carry an Authorization header')
    const authCookieNames = (await page.context().cookies(base)).filter(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)).map(cookie => cookie.name)
    assert.ok(authCookieNames.length > 0, 'Real Supabase sign-in must establish an auth cookie')
    assert.ok(authCookieNames.some(name => reviewHeaders.cookie?.split(';').some(part => part.trim().startsWith(`${name}=`))), 'Human review must carry the real signed-in Supabase cookie')
    assert.match(reviewRequest.postData(), new RegExp(`"expectedTaskVersion":${agentTask.version}(?:[,}])`))
    await expect.poll(async () => {
      const [row] = await db`SELECT t.status,t.version,r.state,r.reviewer_user_id,r.review_comment,l.holder_run_id FROM tasks t
        JOIN agent_runs r ON r.task_id=t.id AND r.workspace_id=t.workspace_id
        JOIN task_agent_leases l ON l.task_id=t.id AND l.workspace_id=t.workspace_id WHERE r.id=${agentRunId}`
      return row && { status: row.status, version: row.version, state: row.state, reviewer: row.reviewer_user_id, comment: row.review_comment, lease: row.holder_run_id }
    }).toEqual({ status: 'done', version: agentTask.version + 1, state: 'succeeded', reviewer: users[0].id, comment: 'Verified in the signed-in canvas', lease: null })
    await expect(run).toContainText('Succeeded')
    await expect.poll(async () => (await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${users[0].id}
      AND client_id='saathi-human-review' AND workspace_id=${workspace} AND command_type='agent_runs.human_review' AND result->>'id'=${agentRunId}`).length).toBe(1)
    assert.deepEqual(await db`SELECT id,status,version FROM tasks WHERE workspace_id=${workspace} AND id<>${agentTaskId} ORDER BY id`, originalTasks)
    await expect(run.getByRole('button', { name: 'Approve and complete task', exact: true })).toHaveCount(0)
    await expect(activity).toContainText('Review approved. Task completed.')
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-agent-reviewed.png`, fullPage: true })
    log({ canvasAgent: { reportedProgressAndEvidence: true, explicitFollow: true, manualNavigationStopsFollowing: true, signedInHumanApproval: true, versionCheckedCompletion: true, releasedLease: true } })
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 360, height: 800 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await accessibility(page)
    await expect(search).toBeVisible()
    await page.screenshot({ path: `${evidence}/canvas-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'Company canvas', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Company canvas', exact: true })
    await panel.getByLabel('Company name', { exact: true }).fill(companyName)
    await panel.getByRole('button', { name: 'Create company', exact: true }).click()
    await expect.poll(async () => {
      const [row] = await db`SELECT id FROM canvas_resources WHERE kind='organization' AND name=${companyName} AND created_by_user_id=${users[0].id}`
      companyId = row?.id
      return Boolean(companyId)
    }).toBe(true)
    await panel.getByLabel('Section name', { exact: true }).fill(sectionName)
    await panel.getByRole('button', { name: 'Create section', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND name=${sectionName}`).length).toBe(1)
    await panel.getByLabel('Workspace teammate to add to company', { exact: true }).selectOption(users[1].id)
    await panel.getByRole('button', { name: 'Add to company', exact: true }).click()
    await panel.getByLabel('Person or group', { exact: true }).selectOption(`user:${users[1].id}`)
    await panel.getByRole('button', { name: 'Grant access', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM canvas_resource_grants WHERE organization_id=${companyId} AND user_id=${users[1].id} AND revoked_at IS NULL`).length).toBe(1)
    await panel.getByLabel(/Existing workspace members without section access/).check()
    await panel.getByRole('button', { name: 'Attach workspace', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM canvas_resources WHERE workspace_id=${workspace}`).length).toBe(1)
    const [sectionForLink] = await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND name=${sectionName}`
    const [attached] = await db`SELECT id FROM canvas_resources WHERE workspace_id=${workspace}`
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(sectionForLink.id)
    await panel.getByLabel(`Link from ${sectionName}`, { exact: true }).selectOption(attached.id)
    await panel.getByRole('button', { name: 'Create link', exact: true }).click()
    let referenceId
    await expect.poll(async () => {
      const [reference] = await db`SELECT id FROM canvas_references WHERE canvas_resource_id=${sectionForLink.id} AND target_resource_id=${attached.id}`
      referenceId = reference?.id
      return Boolean(referenceId)
    }).toBe(true)
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(page.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toBeVisible()
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-association.png`, fullPage: true })
    await member.goto(`${base}/canvas`)
    const memberSearch = member.getByRole('combobox', { name: 'Search commands and tasks', exact: true })
    await expect(memberSearch).toBeEnabled()
    await member.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toBeVisible()
    await memberSearch.fill('create')
    await expect(member.getByRole('option', { name: 'Create task', exact: true })).toHaveCount(0)
    await memberSearch.fill('Publish handoff')
    await member.getByRole('option', { name: 'Publish handoff', exact: true }).click()
    const details = member.getByRole('dialog', { name: 'Task details', exact: true })
    await expect(details.getByLabel('Title', { exact: true })).toBeDisabled()
    await expect(details.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
    await expect(details.getByRole('textbox', { name: /comment/i })).toHaveCount(0)
    await details.getByRole('button', { name: 'Close', exact: true }).click()
    await member.goto(`${base}/dashboard`)
    await expect(member.getByLabel('Current workspace')).toHaveValue(workspace)
    await expect(member.getByLabel('Task title', { exact: true })).toHaveCount(0)
    await expect(member.getByRole('button', { name: 'New task', exact: true })).toHaveCount(0)
    await expect(member.getByRole('button', { name: /Edit prerequisites for/ })).toHaveCount(0)
    await member.getByRole('button', { name: 'Workspace menu', exact: true }).click()
    await expect(member.getByRole('menuitem', { name: 'Settings', exact: true })).toHaveCount(0)
    await member.keyboard.press('Escape')
    await member.goto(`${base}/canvas`)
    await expect(memberSearch).toBeEnabled()
    await member.evaluate(id => {
      const source = new EventSource(`/api/realtime?workspaceId=${id}`)
      window.__canvasAccessProbe = { source, connected: false, errors: 0 }
      source.onmessage = event => { if (JSON.parse(event.data).type === 'connected') window.__canvasAccessProbe.connected = true }
      source.onerror = () => { window.__canvasAccessProbe.errors++ }
    }, workspace)
    await expect.poll(() => member.evaluate(() => window.__canvasAccessProbe.connected)).toBe(true)
    await page.getByRole('button', { name: 'Company canvas', exact: true }).click()
    const [section] = await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND name=${sectionName}`
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(section.id)
    const grant = panel.locator('section').filter({ has: panel.getByRole('heading', { name: 'Explicit grants', exact: true }) }).locator('div.rounded-lg').filter({ hasText: 'QA member' })
    page.once('dialog', dialog => dialog.accept())
    await grant.getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect.poll(async () => (await member.request.get(`${base}/api/usage?workspaceId=${workspace}`)).status()).toBe(403)
    await expect.poll(() => member.evaluate(() => window.__canvasAccessProbe.errors), { timeout: 15000 }).toBeGreaterThan(0)
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toHaveCount(0)
    await member.evaluate(() => { window.__canvasAccessProbe.source.close(); delete window.__canvasAccessProbe })
    log({ canvas: { deterministicCreate: true, scopedSearch: true, draftRecovery: true, desktopMobileAccessibility: true, reducedMotion: true, sectionReadOnly: true, legacyReadOnly: true, referenceRoundtrip: true, realtimeRevocation: true } })
  } finally {
    await member.evaluate(() => { window.__canvasAccessProbe?.source.close(); delete window.__canvasAccessProbe }).catch(() => {})
    await db.begin(async tx => {
      await tx`DELETE FROM platform_command_receipts WHERE actor_user_id=${users[0].id} AND client_id='saathi-human-review'
        AND workspace_id=${workspace} AND command_type='agent_runs.human_review' AND result->>'id'=${agentRunId}`
      if (agentTaskId) await tx`DELETE FROM task_agent_leases WHERE workspace_id=${workspace} AND task_id=${agentTaskId}`
      await tx`DELETE FROM agent_runs WHERE id=${agentRunId} AND actor_user_id=${users[0].id} AND workspace_id=${workspace}`
      await tx`DELETE FROM platform_delegations WHERE id=${agentGrantId} AND actor_user_id=${users[0].id} AND client_id=${agentClientId}`
    })
    assert.equal((await db`SELECT id FROM agent_runs WHERE id=${agentRunId}`).length, 0)
    assert.equal((await db`SELECT id FROM platform_delegations WHERE id=${agentGrantId}`).length, 0)
    if (agentTaskId) assert.equal((await db`SELECT task_id FROM task_agent_leases WHERE workspace_id=${workspace} AND task_id=${agentTaskId}`).length, 0)
    assert.equal((await db`SELECT command_id FROM platform_command_receipts WHERE actor_user_id=${users[0].id}
      AND client_id='saathi-human-review' AND workspace_id=${workspace} AND command_type='agent_runs.human_review' AND result->>'id'=${agentRunId}`).length, 0)
    const owned = await db`SELECT id FROM canvas_resources WHERE kind='organization' AND name=${companyName} AND created_by_user_id=${users[0].id}`
    assert.ok(owned.length <= 1)
    for (const row of owned) {
      await db.begin(async tx => { await tx`DELETE FROM canvas_resources WHERE organization_id=${row.id}` })
      assert.equal((await db`SELECT id FROM canvas_resources WHERE organization_id=${row.id}`).length, 0)
    }
  }
}
