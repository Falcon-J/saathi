import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 30_000 })

const locationControl = page => page.getByRole('button', { name: /^Canvas location:/ })
async function selectWorkspace(page, id) {
  await locationControl(page).click()
  await page.getByRole('menu', { name: 'Canvas locations', exact: true }).locator('[role="menuitem"][data-workspace-id="' + id + '"]').click()
  await expect(locationControl(page)).toHaveAttribute('data-workspace-id', id)
}
async function openWorkspaceTools(page) {
  const show = page.getByRole('button', { name: 'Show canvas', exact: true })
  if (await show.isVisible()) return
  await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
}
async function filterTasks(area, value) {
  const input = area.getByRole('textbox', { name: 'Filter tasks', exact: true })
  if (!await input.isVisible()) await area.locator('summary').filter({ hasText: 'Filters' }).click()
  await input.fill(value)
}

const canvasHierarchy = page => page.getByRole('navigation', { name: 'Canvas hierarchy', exact: true })

async function navigateCanvas(page, label) {
  const hierarchy = canvasHierarchy(page)
  await hierarchy.getByRole('button', { name: /^Canvas location:/ }).click()
  const locations = page.getByRole('menu', { name: 'Canvas locations', exact: true })
  // The menu item itself owns the stable label; avoid matching a path's ancestors.
  const destination = locations.locator(`[role="menuitem"][data-canvas-label=${JSON.stringify(label)}]`)
  await expect(destination).toHaveCount(1)
  await destination.click()
}

async function expectCurrentCanvas(page, label) {
  const current = canvasHierarchy(page).getByRole('button', { name: /^Canvas location:/ })
  await expect(current).toHaveAttribute('aria-current', 'location')
  await expect(current).toHaveText(label)
}

async function canvasHeaderAction(page, name) {
  await page.getByRole('button', { name: 'Canvas menu', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

async function expectTouchControl(locator) {
  await expect(locator).toBeVisible()
  await expect.poll(async () => {
    const box = await locator.boundingBox()
    return Boolean(box && box.width >= 44 && box.height >= 44)
  }).toBe(true)
}

async function expectNoHorizontalOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

async function expectInsideCanvas(page, locator, container) {
  await expect(locator).toBeVisible()
  await expect.poll(async () => {
    const item = await locator.boundingBox()
    const canvas = await page.getByRole('region', { name: 'Workspace canvas', exact: true }).boundingBox()
    const card = container ? await container.boundingBox() : canvas
    const viewport = page.viewportSize()
    return Boolean(item && canvas && card && viewport && item.width > 0 && item.height > 0
      && item.x >= Math.max(0, canvas.x, card.x) - 1 && item.y >= Math.max(0, canvas.y, card.y) - 1
      && item.x + item.width <= Math.min(viewport.width, canvas.x + canvas.width, card.x + card.width) + 1
      && item.y + item.height <= Math.min(viewport.height, canvas.y + canvas.height, card.y + card.height) + 1)
  }).toBe(true)
}

/** Extends the real-Auth handoff verifier, reusing its server, users and cleanup. */
export async function verifyCanvasWorkflow({ page, member, db, bridge, workspace, users, base, accessibility, evidence, log }) {
  const companyName = `Canvas acceptance ${randomUUID()}`
  const spaceName = 'Delivery space'
  const sectionName = 'Delivery section'
  const agentRunId = randomUUID(), agentGrantId = randomUUID(), agentClientId = `canvas-browser-${randomUUID()}`
  const otherWorkspace = randomUUID(), privateWorkspace = randomUUID()
  const otherWorkspaceName = 'Canvas second workspace'
  const otherTask = randomUUID(), privateTask = randomUUID()
  const sharedQuery = `Canvas cross-workspace ${randomUUID()}`
  const otherTitle = `${sharedQuery} visible`, privateTitle = `${sharedQuery} private`
  const createdWorkspaceNames = []
  const createdWorkspaces = []
  let agentTaskId
  let companyId
  try {
    // The preceding Ready/Waiting journey ends at its mobile viewport.
    await page.setViewportSize({ width: 1280, height: 900 })
    await db.begin(async tx => {
      await tx`INSERT INTO workspaces(id,name,owner_user_id) VALUES(${otherWorkspace},${otherWorkspaceName},${users[0].id}),(${privateWorkspace},'Private outsider workspace',${users[2].id})`
      await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${otherWorkspace},${users[0].id}),(${privateWorkspace},${users[2].id})`
      await tx`INSERT INTO tasks(id,workspace_id,title,created_by_user_id) VALUES(${otherTask},${otherWorkspace},${otherTitle},${users[0].id}),(${privateTask},${privateWorkspace},${privateTitle},${users[2].id})`
    })
    await page.goto(`${base}/dashboard`)
    await expect(page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true })).toHaveCount(1)
    await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true }).click()
    await expect(page).toHaveURL(url => url.origin === new URL(base).origin && url.pathname === '/canvas')
    const viewportMetadata = await page.locator('meta[name="viewport"]').getAttribute('content')
    assert.doesNotMatch(viewportMetadata, /viewport-fit=cover/)
    assert.match(viewportMetadata, /interactive-widget=resizes-content/)
    assert.doesNotMatch(viewportMetadata, /user-scalable=no|maximum-scale=1(?:[,\s]|$)/)
    await selectWorkspace(page, workspace)
    await expect(page.getByRole('region', { name: 'Workspace canvas', exact: true })).toBeVisible()
    log({ canvasStage: 'overview-cross-workspace-search' })
    await navigateCanvas(page, 'Canvas')
    const search = page.getByRole('combobox', { name: 'Search commands and tasks', exact: true })
    await expect(search).toBeEnabled()
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
    await search.fill(sharedQuery)
    await expect(page.getByRole('option').filter({ hasText: otherTitle })).toBeVisible()
    await expect(page.getByRole('option').filter({ hasText: privateTitle })).toHaveCount(0)
    log({ canvasStage: 'cross-workspace-open-task' })
    await page.getByRole('option').filter({ hasText: otherTitle }).click()
    const crossWorkspaceEditor = page.getByRole('dialog', { name: 'Edit task', exact: true })
    await expect(locationControl(page)).toHaveAttribute('data-workspace-id', otherWorkspace)
    await expect(crossWorkspaceEditor.getByLabel('Title', { exact: true })).toHaveValue(otherTitle)
    log({ canvasStage: 'cross-workspace-cancel-editor' })
    await crossWorkspaceEditor.getByRole('button', { name: 'Cancel', exact: true }).click()
    log({ canvasStage: 'cross-workspace-return-picker' })
    await selectWorkspace(page, workspace)
    await expect(search).toBeEnabled()
    await search.fill('Publish handoff')
    await page.getByRole('option').filter({ hasText: 'Publish handoff' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit task', exact: true })
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Publish handoff')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(search).toBeVisible()
    await search.fill('create')
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
    const title = `Canvas task ${randomUUID()} ${"Long task title with useful context ".repeat(5)}`.slice(0, 190)
    await page.getByLabel('Task title', { exact: true }).fill(title)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM tasks WHERE workspace_id=${workspace} AND title=${title}`).length).toBe(1)
    // A long, assigned and described record must keep its action inside the fixed card.
    await db`UPDATE tasks SET description=${"Detailed task context. ".repeat(40)},assignee_user_id=${users[0].id} WHERE workspace_id=${workspace} AND title=${title}`
    const retainedDraft = `Canvas retained draft ${randomUUID()}`
    await page.getByLabel('Task title', { exact: true }).fill(retainedDraft)
    await expect.poll(() => page.evaluate(value => Object.values(sessionStorage).some(raw => raw.includes(value)), retainedDraft)).toBe(true)
    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
    await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(retainedDraft)
    page.once('dialog', dialog => dialog.accept())
    await page.reload()
    await expect(search).toBeEnabled()
    log({ canvasStage: 'reload-workspace-draft-recovery' })
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await page.locator(`.react-flow__node[data-id="workspace:${workspace}"]`).getByRole('button', { name: 'Open Ready Waiting acceptance', exact: true }).click()
    await openWorkspaceTools(page)
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
    const run = activity.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await expect(run).toContainText('Awaiting review')
    await expect(run).toContainText(progress)
    await expect(run).toContainText(agentEvidence)
    await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toHaveCount(0)
    await expect(workArea.getByRole('heading', { name: 'Ready Waiting acceptance', exact: true, level: 2 })).toBeVisible()
    await run.getByRole('button', { name: 'Follow agent', exact: true }).click()
    await expect(run.getByRole('button', { name: 'Following agent', exact: true })).toBeDisabled()
    await expect(workArea.getByRole('heading', { name: title, exact: true, level: 2 })).toBeVisible()
    await page.setViewportSize({ width: 360, height: 800 })
    await expectTouchControl(page.getByRole('button', { name: 'Stop following', exact: true }))
    const followingDock = await page.getByRole('region', { name: 'Canvas commands', exact: true }).boundingBox()
    assert.ok(followingDock && followingDock.height <= 132 && followingDock.y + followingDock.height <= 800, 'Phone following controls must fit inside their reserved dock')
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Stop following', exact: true }).click()
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(run.getByRole('button', { name: 'Follow agent', exact: true })).toBeEnabled()
    await run.getByRole('button', { name: 'Follow agent', exact: true }).click()
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toHaveCount(0)
    await expect(run.getByRole('button', { name: 'Follow agent', exact: true })).toBeEnabled()
    await run.getByLabel('Review comment', { exact: true }).fill('Verified in the signed-in canvas')
    await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('agents')
    await expect(run.getByLabel('Review comment', { exact: true })).toHaveValue('Verified in the signed-in canvas')
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
    await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-desktop.png`, fullPage: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const taskNode = page.locator(`.react-flow__node[data-id="task:${workspace}:${agentTaskId}"]`)
    for (const viewport of [{ width: 360, height: 800 }, { width: 800, height: 360 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      await expectInsideCanvas(page, taskNode.getByRole('heading', { name: title, exact: true }), taskNode)
      await expectInsideCanvas(page, taskNode.getByRole('button', { name: `Open ${title}`, exact: true }), taskNode)
      await expect(taskNode).toContainText("QA owner")
      await expect(taskNode).not.toContainText(users[0].email)
      await expect(search).toBeVisible()
      await accessibility(page)
    }
    await taskNode.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await openWorkspaceTools(page)
    await expect(workArea).toBeVisible()
    await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('ready')
    await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('ready')
    await expect(workArea.getByRole('heading', { name: 'Ready and Waiting', exact: true })).toBeVisible()
    await expect(workArea.getByRole('region', { name: 'Waiting', exact: true })).toContainText('Approve brief')
    await expect.poll(async () => {
      const pane = await workArea.boundingBox()
      const mounted = await page.locator('.react-flow').count()
      return Boolean(mounted === 1 && pane && pane.y === 64 && pane.height >= 600)
    }).toBe(true)
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-mobile.png`, fullPage: true })
    await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
    await page.goto(`${base}/dashboard`)
    await expect(page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true })).toHaveCount(1)
    await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true }).click()
    await expect(page).toHaveURL(url => url.origin === new URL(base).origin && url.pathname === '/canvas')
    await expect(search).toBeEnabled()
    await page.setViewportSize({ width: 1280, height: 900 })
    await canvasHeaderAction(page, 'Manage canvas')
    const panel = page.getByRole('dialog', { name: 'Company canvas', exact: true })
    await panel.getByLabel('Company name', { exact: true }).fill(companyName)
    await panel.getByRole('button', { name: 'Create company', exact: true }).click()
    await expect.poll(async () => {
      const [row] = await db`SELECT id FROM canvas_resources WHERE kind='organization' AND name=${companyName} AND created_by_user_id=${users[0].id}`
      companyId = row?.id
      return Boolean(companyId)
    }).toBe(true)
    await panel.getByLabel('Container type', { exact: true }).selectOption('space')
    await panel.getByLabel('Section name', { exact: true }).fill(spaceName)
    await panel.getByRole('button', { name: 'Create space', exact: true }).click()
    let spaceId
    await expect.poll(async () => {
      const [row] = await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND parent_id=${companyId} AND kind='space' AND name=${spaceName}`
      spaceId = row?.id
      return Boolean(spaceId)
    }).toBe(true)
    await expect(panel.getByLabel('Company, section or workspace', { exact: true })).toHaveValue(spaceId)
    // Creating a Space must leave a valid child kind selected without manual recovery.
    await expect(panel.getByLabel('Container type', { exact: true })).toHaveValue('section')
    await panel.getByLabel('Section name', { exact: true }).fill(sectionName)
    await panel.getByRole('button', { name: 'Create section', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND parent_id=${spaceId} AND kind='section' AND name=${sectionName}`).length).toBe(1)
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
    const hierarchy = page.getByRole('navigation', { name: 'Canvas hierarchy', exact: true })
    const [journeyWorkspace] = await db`SELECT name FROM workspaces WHERE id=${workspace}`
    assert.equal((await db`SELECT parent_id FROM canvas_resources WHERE id=${attached.id}`)[0].parent_id, sectionForLink.id)
    // Exercise the hierarchy forwards through the actual cards, independently of search.
    // Keep numeric space evidence descriptive: a dense map is not itself a failure.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      const phase = async (step, work) => {
        log({ canvasJourney: { viewport, step, state: 'started' } })
        try {
          await work()
          if (['overview', 'company-open-keyboard', 'space-open', 'section-open', 'workspace-open', 'task-open'].includes(step)) {
            await page.screenshot({ path: `${evidence}/canvas-hierarchy-${viewport.width}-${step}.png`, fullPage: true })
          }
          log({ canvasJourney: { viewport, step, state: 'passed' } })
        } catch (error) {
          log({ canvasJourney: { viewport, step, state: 'failed', error: error instanceof Error ? error.message : 'Unknown browser assertion' } })
          throw new Error(`Canvas hierarchy journey ${viewport.width}x${viewport.height}: ${step}: ${error instanceof Error ? error.message : "Unknown browser assertion"}`, { cause: error })
        }
      }
      const current = label => expectCurrentCanvas(page, label)
      const openCard = async (id, label, activation = 'button') => {
        const card = page.locator(`.react-flow__node[data-id="${id}"]`)
        const heading = card.getByRole('heading', { name: label, exact: true })
        const button = card.getByRole('button', { name: `Open ${label}`, exact: true })
        await expectInsideCanvas(page, heading, card)
        await expectInsideCanvas(page, button, card)
        const canvas = await page.getByRole('region', { name: 'Workspace canvas', exact: true }).boundingBox()
        const bounds = await card.boundingBox(), headingBounds = await heading.boundingBox(), buttonBounds = await button.boundingBox()
        const round = value => Math.round(value * 1000) / 1000
        const box = value => Object.fromEntries(Object.entries(value).map(([key, number]) => [key, round(number)]))
        log({ canvasSpace: { viewport, kind: id === `container:${companyId}` ? 'company' : id === `container:${spaceId}` ? 'space' : id === `container:${sectionForLink.id}` ? 'section' : id.split(':')[0], activation, canvas: box(canvas), card: box(bounds), heading: box(headingBounds), openControl: box(buttonBounds),
          canvasViewportAreaRatio: round(canvas.width * canvas.height / (viewport.width * viewport.height)),
          cardCanvasAreaRatio: round(bounds.width * bounds.height / (canvas.width * canvas.height)),
          cardHeaderHeightRatio: round((Math.max(headingBounds.y + headingBounds.height, buttonBounds.y + buttonBounds.height) - bounds.y) / bounds.height) } })
        if (activation === 'keyboard') {
          await button.focus()
          await expect(button).toBeFocused()
          await page.keyboard.press('Enter')
        } else await (activation === 'heading' ? heading : button).click()
        // A modal task editor removes background navigation from the accessibility tree.
        if (!id.startsWith("task:")) await current(label)
        await expect(panel).not.toBeVisible()
      }
      const openJourneyTask = async completed => {
        if (viewport.width >= 640) return openCard(`task:${workspace}:${agentTaskId}`, title)
        log({ canvasJourney: { viewport, step: completed ? 'completed-summary-to-task' : 'ready-summary-to-task', state: 'started' } })
        await navigateCanvas(page, journeyWorkspace.name)
        if (completed) {
          await page.getByRole('button', { name: /^Open Completed, \d+ tasks$/ }).click()
          const completedList = page.getByRole('dialog', { name: 'Completed tasks', exact: true })
          await completedList.getByRole('button').filter({ hasText: title }).click()
        } else {
          await page.getByRole('button', { name: /^Open Ready, \d+ tasks$/ }).click()
          const ready = workArea.getByRole('region', { name: 'Ready', exact: true })
          await ready.getByRole('button', { name: `Open ${title}`, exact: true }).click()
        }
      }
      await phase('overview', async () => {
        await navigateCanvas(page, 'Canvas')
        await page.getByRole('button', { name: 'Fit View', exact: true }).click()
        await current('Canvas')
        await expect(workArea).not.toBeVisible()
        await expect(search).toHaveAttribute('aria-expanded', 'false')
        const canvas = await page.getByRole('region', { name: 'Workspace canvas', exact: true }).boundingBox()
        const dock = await page.getByRole('region', { name: 'Canvas commands', exact: true }).boundingBox()
        assert.ok(canvas && dock, 'Full-map canvas and closed command dock must have bounds')
        const gap = dock.y - (canvas.y + canvas.height)
        const navigationBox = await hierarchy.boundingBox()
        const flowBox = await page.locator('.react-flow').boundingBox()
        assert.ok(navigationBox && flowBox && navigationBox.y + navigationBox.height <= flowBox.y + 1, 'Canvas hierarchy must end above the actual flow viewport')
        log({ canvasDockSpace: { viewport, canvasBottom: canvas.y + canvas.height, dockTop: dock.y, gap } })
        assert.ok(gap >= 0 && gap <= 33, `Canvas-to-dock gap must be 0–32px plus 1px border tolerance; got ${gap}px`)
      })
      await phase('company-open-keyboard', () => openCard(`container:${companyId}`, companyName, 'keyboard'))
      await phase('space-open', () => openCard(`container:${spaceId}`, spaceName))
      await phase('section-open', () => openCard(`container:${sectionForLink.id}`, sectionName))
      await phase('workspace-open', async () => {
        await openCard(`workspace:${workspace}`, journeyWorkspace.name, 'heading')
        await expect(locationControl(page)).toHaveAttribute('data-workspace-id', workspace)
      })
      if (viewport.width < 640) await phase('touch-create-and-draft-recovery', async () => {
        const newTask = page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: 'New task', exact: true })
        await expectTouchControl(newTask)
        await newTask.click()
        const taskTitle = workArea.getByLabel('Task title', { exact: true })
        const draft = `Phone draft ${randomUUID()}`
        await taskTitle.fill(draft)
        await expect.poll(() => page.evaluate(value => Object.values(sessionStorage).some(raw => raw.includes(value)), draft)).toBe(true)
        page.once('dialog', dialog => dialog.dismiss())
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
        await expect(taskTitle).toHaveValue(draft)
        page.once('dialog', dialog => dialog.accept())
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
        await newTask.click()
        await expect(taskTitle).toHaveValue(draft)
        await workArea.getByRole('button', { name: 'Close new task', exact: true }).click()
        await expect(taskTitle).not.toBeVisible()
        await workArea.getByRole('button', { name: `Edit ${title}`, exact: true }).click()
        await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
        await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
        await search.fill('create')
        await page.getByRole('option', { name: 'Create task', exact: true }).click()
        await expect(taskTitle).toHaveValue(draft)
        await taskTitle.fill('')
        await workArea.getByRole('button', { name: 'Close new task', exact: true }).click()
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
      })
      if (viewport.width === 1280) await phase('exclude-task-from-board', async () => {
        await openWorkspaceTools(page)
        await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
        await filterTasks(workArea, `excluded-${agentRunId}`)
        await expect(workArea.getByText('Showing 0 matching tasks', { exact: true })).toBeVisible()
        const boardSpace = await workArea.locator('[aria-label="Task board"]').evaluate(grid => {
          const sections = [...grid.children].filter(child => child.tagName === 'SECTION').map(section => section.getBoundingClientRect())
          const template = getComputedStyle(grid).gridTemplateColumns
          return { columns: template.split(' ').length, template, minColumnWidth: Math.min(...sections.map(section => section.width)), emptySectionHeights: sections.map(section => section.height), height: grid.getBoundingClientRect().height }
        })
        log({ canvasBoardSpace: { viewport, ...boardSpace } })
        assert.equal(boardSpace.emptySectionHeights.length, 0, 'Compact empty results must not render empty status columns')
        assert.ok(boardSpace.height < 144, 'Compact empty results must not waste a full working surface')
        await expect(workArea.getByText('No tasks match these filters.', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
      })
      await phase('task-open', async () => {
        await openJourneyTask(true)
        await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
        if (viewport.width < 640) {
          const titleInput = editor.getByLabel('Title', { exact: true })
          await expectTouchControl(editor.getByRole('button', { name: 'Save changes', exact: true }))
          await expectTouchControl(editor.getByRole('button', { name: 'Cancel', exact: true }))
          const bounds = await editor.boundingBox()
          assert.ok(bounds && bounds.x <= 1 && bounds.width >= viewport.width - 2, 'Phone editor must span the viewport width')
          const save = await editor.getByRole('button', { name: 'Save changes', exact: true }).boundingBox()
          const cancel = await editor.getByRole('button', { name: 'Cancel', exact: true }).boundingBox()
          assert.ok(Math.abs(save.y - cancel.y) <= 1, 'Phone editor actions must share a row')
          const status = await editor.getByLabel('Status', { exact: true }).boundingBox()
          const assignee = await editor.getByLabel('Assignee', { exact: true }).boundingBox()
          assert.ok(status && assignee && Math.abs(status.y - assignee.y) <= 1, 'Status and assignee must share a row at 360px')
          assert.ok(await titleInput.evaluate(input => parseFloat(getComputedStyle(input).fontSize)) >= 16, 'Phone fields must avoid focus zoom')
          const keyboardDraft = `${title.slice(0, 170)} phone draft`
          await titleInput.fill(keyboardDraft)
          await titleInput.focus()
          // A smaller browser viewport models available space; this is not a native OS keyboard test.
          await page.setViewportSize({ width: viewport.width, height: 480 })
          await expect(titleInput).toBeFocused()
          await expect(titleInput).toBeInViewport()
          await expectNoHorizontalOverflow(page)
          await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
          const discard = page.getByRole('alertdialog', { name: 'Discard unsaved changes?', exact: true })
          await expect(discard).toBeVisible()
          await discard.getByRole('button', { name: 'Cancel', exact: true }).click()
          await expect(titleInput).toHaveValue(keyboardDraft)
          await page.setViewportSize(viewport)
          await titleInput.fill(title)
        }
        await accessibility(page)
      })
      const [beforeEdit] = await db`SELECT version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
      const description = `Hierarchy journey edited at ${viewport.width}x${viewport.height}`
      await phase('task-edit', async () => {
        await editor.getByLabel('Description', { exact: true }).fill(description)
        await editor.getByLabel('Status', { exact: true }).selectOption('in-progress')
        await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
        await expect(editor).not.toBeVisible()
        await current(title)
        await expect(page).toHaveURL(url => url.searchParams.get('workspace') === workspace && url.searchParams.get('task') === agentTaskId && url.searchParams.get('view') === 'tasks')
        await expect.poll(async () => {
          const [row] = await db`SELECT description,status,version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
          return row && { description: row.description, status: row.status, version: row.version }
        }).toEqual({ description, status: 'in_progress', version: beforeEdit.version + 1 })
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
      })
      await phase('same-task-reopen', async () => {
        await openJourneyTask(false)
        await expect(editor.getByLabel('Description', { exact: true })).toHaveValue(description)
        await expect(editor.getByLabel('Status', { exact: true })).toHaveValue('in-progress')
        await editor.getByLabel('Description', { exact: true }).fill(`${description} after reopening`)
        await editor.getByRole('button', { name: 'Save changes', exact: true }).click()
        await expect(editor).not.toBeVisible()
        await expect.poll(async () => {
          const [row] = await db`SELECT description,version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
          return row && { description: row.description, version: row.version }
        }).toEqual({ description: `${description} after reopening`, version: beforeEdit.version + 2 })
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
      })
      await phase('task-complete', async () => {
        await page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: `Complete ${title}`, exact: true }).click()
        await expect.poll(async () => {
          const [row] = await db`SELECT status,version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
          return row && { status: row.status, version: row.version }
        }).toEqual({ status: 'done', version: beforeEdit.version + 3 })
        await current(title)
        await expect(page).toHaveURL(url => url.searchParams.get('workspace') === workspace && url.searchParams.get('task') === agentTaskId)
        await accessibility(page)
        await page.screenshot({ path: `${evidence}/canvas-hierarchy-${viewport.width}.png`, fullPage: true })
      })
      for (const [kind, label] of [['workspace', journeyWorkspace.name], ['section', sectionName], ['space', spaceName], ['company', companyName], ['canvas', 'Canvas']]) {
        await phase(`return-${kind}`, async () => {
          await navigateCanvas(page, label)
          await current(label)
          await expect(workArea).not.toBeVisible()
        })
      }
      if (viewport.width === 1280) await phase('reset-board-filter', async () => {
        await page.locator(`.react-flow__node[data-id="workspace:${workspace}"]`).getByRole('button', { name: `Open ${journeyWorkspace.name}`, exact: true }).click()
        await openWorkspaceTools(page)
        await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
        await filterTasks(workArea, '')
        await expect(workArea.getByText(/^Showing [1-9]\d* matching tasks?(?: so far)?$/)).toBeVisible()
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
        await navigateCanvas(page, 'Canvas')
        await current('Canvas')
      })
    }
    // Resize the same authenticated hierarchy rather than repeating database journeys.
    for (const viewport of [{ width: 320, height: 740 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 600, height: 360 }, { width: 390, height: 500 }]) {
      await page.setViewportSize(viewport)
      await navigateCanvas(page, 'Canvas')
      const picker = locationControl(page)
      await expectTouchControl(picker)
      assert.ok(await picker.evaluate(input => parseFloat(getComputedStyle(input).fontSize)) >= 16, 'Phone workspace picker must use a 16px font')
      const menuTrigger = page.getByRole('button', { name: 'Canvas menu', exact: true })
      await expectTouchControl(menuTrigger)
      await menuTrigger.click()
      await expectTouchControl(page.getByRole('menuitem', { name: 'Refresh canvas', exact: true }))
      await expectTouchControl(page.getByRole('menuitem', { name: 'Manage canvas', exact: true }))
      await expectTouchControl(page.getByRole('menuitem', { name: 'Create workspace', exact: true }))
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Open workspace tools', exact: true })).not.toBeVisible()
      await search.fill('task list')
      await expect(page.getByRole('option', { name: 'Task list', exact: true })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: 'New task', exact: true })).toHaveCount(0)
      await search.fill('')
      await page.keyboard.press('Escape')
      for (const [id, label] of [[companyId, companyName], [spaceId, spaceName], [sectionForLink.id, sectionName]]) {
        await page.locator(`.react-flow__node[data-id="container:${id}"]`).getByRole('button', { name: `Open ${label}`, exact: true }).click()
        await expectCurrentCanvas(page, label)
      }
      await page.locator(`.react-flow__node[data-id="workspace:${workspace}"]`).getByRole('button', { name: `Open ${journeyWorkspace.name}`, exact: true }).click()
      await expectCurrentCanvas(page, journeyWorkspace.name)
      await expectTouchControl(hierarchy.getByRole('button', { name: /^Canvas location:/ }))
      await hierarchy.getByRole('button', { name: /^Canvas location:/ }).click()
      const locations = page.getByRole('menu', { name: 'Canvas locations', exact: true })
      const locationItems = locations.locator('[role=menuitem][data-canvas-focus]')
      for (const item of await locationItems.all()) {
        await expectTouchControl(item)
        assert.ok(JSON.parse(await item.getAttribute('data-canvas-focus')), 'Location must expose a canonical focus')
      }
      const workspaceLocation = locations.locator(`[data-canvas-label=${JSON.stringify(journeyWorkspace.name)}]`)
      await expect(workspaceLocation).toHaveText(`Canvas / ${companyName} / ${spaceName} / ${sectionName} / ${journeyWorkspace.name}`)
      await page.keyboard.press('Escape')
      await expectTouchControl(page.getByRole('button', { name: 'Open workspace tools', exact: true }))
      await expectTouchControl(hierarchy.getByRole('button', { name: 'Back', exact: true }))
      const dock = page.getByRole('region', { name: 'Canvas commands', exact: true })
      await expectTouchControl(dock.getByRole('button', { name: 'New task', exact: true }))
      const searchBox = await search.boundingBox(), dockBox = await dock.boundingBox()
      assert.ok(searchBox && searchBox.height >= 48, 'Phone search row must be at least 48px')
      assert.ok(dockBox && dockBox.height <= 70, 'Closed phone commands must use one compact row')
      const flowBox = await page.locator('.react-flow').boundingBox()
      assert.ok(flowBox && flowBox.y + flowBox.height <= dockBox.y + 1, 'Phone canvas must reserve the command dock')
      await search.fill('task list')
      await expect(page.getByRole('option', { name: 'Task list', exact: true })).toBeVisible()
      await search.fill('')
      await page.keyboard.press('Escape')
      await expectNoHorizontalOverflow(page)
      log({ canvasPhoneGeometry: { viewport, touchControls: true, fullPathLocations: true, compactDock: true, noHorizontalOverflow: true } })
    }
    const [beforeHistory] = await db`SELECT version,description FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      await selectWorkspace(page, workspace)
      await expect(page).toHaveURL(url => url.searchParams.get('workspace') === workspace && !url.searchParams.has('task'))
      const workspaceUrl = page.url()
      await search.fill(title.slice(0, 100))
      await page.getByRole('option', { name: title, exact: true }).click()
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
      await expect(page).toHaveURL(url => url.searchParams.get('task') === agentTaskId && url.searchParams.get('view') === 'tasks')
      const taskUrl = page.url(), retainedDescription = 'Retained history draft ' + viewport.width
      await editor.getByLabel('Description', { exact: true }).fill(retainedDescription)
      page.once('dialog', dialog => dialog.dismiss())
      await page.goBack()
      await expect(page).toHaveURL(taskUrl)
      await expect(editor.getByLabel('Description', { exact: true })).toHaveValue(retainedDescription)
      page.once('dialog', dialog => dialog.accept())
      await page.goBack()
      await expect(page).toHaveURL(workspaceUrl)
      await expect(editor).not.toBeVisible()
      await page.goForward()
      await expect(page).toHaveURL(taskUrl)
      await expect(editor.getByLabel('Description', { exact: true })).toHaveValue(retainedDescription)
      await editor.getByLabel('Description', { exact: true }).fill(beforeHistory.description ?? '')
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.reload()
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.goto(base + '/canvas?workspace=' + otherWorkspace + '&task=' + otherTask + '&view=tasks')
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(otherTitle)
      await expect(locationControl(page)).toHaveAttribute('data-workspace-id', otherWorkspace)
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.goto(base + '/canvas?workspace=' + workspace + '&task=' + randomUUID() + '&view=tasks')
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(editor).not.toBeVisible()
      await expect(page).toHaveURL(url => !url.searchParams.has('task'))
      await page.goto(base + '/canvas?workspace=' + privateWorkspace + '&task=' + privateTask + '&view=tasks')
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0)
      await expect(editor).not.toBeVisible()
      await expect(page).toHaveURL(url => !url.searchParams.has('workspace') && !url.searchParams.has('task'))
      await page.goto(taskUrl)
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
      await accessibility(page)
      await page.screenshot({ path: evidence + '/canvas-history-' + viewport.width + '.png', fullPage: true })
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await navigateCanvas(page, journeyWorkspace.name)
      log({ canvasHistory: { viewport, cancelledBackPreservedDraft: true, backForward: true, deepLinkReload: true, crossWorkspace: true, deniedLinks: true } })
    }
    const [afterHistory] = await db`SELECT version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
    assert.equal(afterHistory.version, beforeHistory.version, 'History navigation must not mutate the task')
    const sharedTaskUrl = base + '/canvas?workspace=' + workspace + '&task=' + agentTaskId + '&view=tasks'
    for (const user of [users[0], users[2]]) {
      const guestContext = await page.context().browser().newContext({ viewport: { width: 360, height: 800 } })
      try {
        const guest = await guestContext.newPage(), guestErrors = []
        guest.on('pageerror', () => guestErrors.push(true))
        await guest.goto(sharedTaskUrl)
        await expect(guest).toHaveURL(url => url.pathname === '/login' && url.searchParams.get('redirect') === sharedTaskUrl.slice(base.length))
        await guest.getByLabel('Email', { exact: true }).fill(user.email)
        await guest.getByLabel('Password', { exact: true }).fill(user.password)
        await guest.getByRole('button', { name: 'Sign in', exact: true }).click()
        if (user === users[0]) await expect(guest.getByRole('dialog', { name: 'Edit task', exact: true }).getByLabel('Title', { exact: true })).toHaveValue(title)
        else {
          await expect(guest.getByRole('alert')).toBeVisible()
          await expect(guest.getByText(title, { exact: true })).toHaveCount(0)
          await expect(guest.getByRole('dialog', { name: /task/i })).toHaveCount(0)
        }
        assert.equal(guestErrors.length, 0, 'Shared-link sign-in must not throw browser exceptions')
      } finally { await guestContext.close() }
    }
    log({ canvasSharedSignIn: { authorizedTaskRestored: true, unauthorizedTaskHidden: true } })
    await page.setViewportSize({ width: 360, height: 800 })
    await selectWorkspace(page, workspace)
    await openWorkspaceTools(page)
    await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
    await expect(page).toHaveURL(url => url.searchParams.get('workspace') === workspace && url.searchParams.get('view') === 'tasks')
    const boundaryCanvasUrl = page.url(), boundaryMarker = randomUUID()
    await canvasHeaderAction(page, 'Open dashboard')
    await expect(page).toHaveURL(base + '/dashboard')
    await page.evaluate(marker => window.history.replaceState({ qaCanvasBoundary: marker }, '', window.location.href), boundaryMarker)
    await page.goBack()
    await expect(page).toHaveURL(boundaryCanvasUrl)
    await expect(workArea).toBeVisible()
    await page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: 'New task', exact: true }).click()
    const boundaryDraft = workArea.getByLabel('Task title', { exact: true })
    await boundaryDraft.fill('Keep the page-boundary draft')
    await workArea.getByRole('button', { name: 'Close new task', exact: true }).click()
    page.once('dialog', dialog => dialog.dismiss())
    await page.goForward()
    await expect(page).toHaveURL(boundaryCanvasUrl)
    await expect(locationControl(page)).toBeVisible()
    await page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: 'New task', exact: true }).click()
    await expect(boundaryDraft).toHaveValue('Keep the page-boundary draft')
    await boundaryDraft.fill('')
    await workArea.getByRole('button', { name: 'Close new task', exact: true }).click()
    await page.goForward()
    await expect(page).toHaveURL(base + '/dashboard')
    assert.equal(await page.evaluate(() => window.history.state?.qaCanvasBoundary), boundaryMarker, 'Cancelled traversal must preserve the original dashboard entry')
    await page.goBack()
    await expect(page).toHaveURL(boundaryCanvasUrl)
    await expect(workArea).toBeVisible()
    await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
    log({ canvasPageBoundary: { cancelledForwardRetainedDraft: true, originalDashboardEntryPreserved: true, returnToCanvas: true } })


    // Verify the three density/context improvements with real Auth and database writes.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      await navigateCanvas(page, 'Canvas')
      for (const [id, label] of [[companyId, companyName], [spaceId, spaceName], [sectionForLink.id, sectionName]]) {
        await page.locator(`.react-flow__node[data-id="container:${id}"]`).getByRole('button', { name: `Open ${label}`, exact: true }).click()
      }
      log({ canvasImprovementStep: { viewport, step: 'contextual-create' } })
      const name = `Context workspace ${viewport.width} ${randomUUID()}`
      createdWorkspaceNames.push(name)
      await canvasHeaderAction(page, 'Create workspace')
      const createDialog = page.getByRole('dialog', { name: 'Create workspace', exact: true })
      await expect(createDialog).toContainText(`Location: ${companyName} / ${spaceName} / ${sectionName}`)
      await createDialog.getByLabel('Workspace name', { exact: true }).fill(name)
      await createDialog.getByRole('button', { name: 'Create workspace', exact: true }).click()
      await expect(createDialog).not.toBeVisible()
      let createdId
      await expect.poll(async () => {
        const [row] = await db`SELECT w.id FROM workspaces w JOIN canvas_resources r ON r.workspace_id=w.id WHERE w.name=${name} AND w.owner_user_id=${users[0].id} AND r.parent_id=${sectionForLink.id}`
        createdId = row?.id
        return Boolean(createdId)
      }).toBe(true)
      createdWorkspaces.push(createdId)
      await expect(locationControl(page)).toHaveAttribute('data-workspace-id', createdId)
      await expectCurrentCanvas(page, name)
      const denseTasks = Array.from({ length: 50 }, (_, index) => ({ id: randomUUID(), title: `Dense task ${String(index).padStart(2, '0')}`, status: index < 40 ? 'todo' : 'done' }))
      await db.begin(async tx => {
        for (const task of denseTasks) await tx`INSERT INTO tasks(id,workspace_id,title,status,created_by_user_id) VALUES(${task.id},${createdId},${task.title},${task.status},${users[0].id})`
      })
      await canvasHeaderAction(page, 'Refresh canvas')
      log({ canvasImprovementStep: { viewport, step: 'dense-summary-refresh' } })
      const readySummary = page.getByRole('button', { name: 'Open Ready, 40 tasks', exact: true })
      await expectInsideCanvas(page, readySummary)
      await expectInsideCanvas(page, page.getByRole('button', { name: 'Open Completed, 10 tasks', exact: true }))
      const canvasBox = await page.getByRole('region', { name: 'Workspace canvas', exact: true }).boundingBox()
      const groupBox = await page.locator(`.react-flow__node[data-id="workspace:${createdId}"]`).boundingBox()
      assert.ok(groupBox.height <= canvasBox.height + 2, 'Dense workspace must fit inside canvas vertically')
      log({ canvasImprovementStep: { viewport, step: 'dense-summary-open-ready-work' } })
      await readySummary.click()
      await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('ready')
      const list = workArea.getByRole('region', { name: 'Ready', exact: true })
      await expect(list.locator('article')).toHaveCount(40)
      await expect(list).not.toContainText(denseTasks[40].title)
      await expect(workArea.getByRole('region', { name: 'Waiting', exact: true })).toHaveCount(0)
      await list.getByRole('button', { name: `Open ${denseTasks[0].title}`, exact: true }).click()
      await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(denseTasks[0].title)
      const dialogBox = await editor.boundingBox(), titleBox = await editor.getByLabel('Title', { exact: true }).boundingBox()
      assert.ok(titleBox.y - dialogBox.y < 180, 'Task title must be near the top of the editor')
      await accessibility(page)
      await page.screenshot({ path: `${evidence}/canvas-compact-editor-${viewport.width}.png`, fullPage: true })
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
      await openWorkspaceTools(page)
      await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('ready')
      await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('ready')
      await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
      await expect(workArea.getByLabel('Task title', { exact: true })).not.toBeVisible()
      await expect(workArea.getByLabel('Task priority filter', { exact: true })).not.toBeVisible()
      log({ canvasImprovementStep: { viewport, step: 'compact-toolbar' } })
      const firstTask = workArea.getByRole('button', { name: /^Edit Dense task / }).first()
      await expect(firstTask).toBeVisible()
      const areaBox = await workArea.boundingBox(), firstBox = await firstTask.boundingBox()
      assert.ok(firstBox && firstBox.y + firstBox.height <= areaBox.y + areaBox.height, 'First task action must fit before scrolling')
      assert.match(await firstTask.innerText(), /Dense task \d+/, 'First task action must expose the task title')
      if (viewport.width < 640) assert.ok(areaBox.height >= 600, 'Mobile work must fill the available surface')
      const rows = workArea.locator('[data-task-row]')
      await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(3)
      if (viewport.width < 640) {
        for (const row of await rows.all().then(items => items.slice(0, 3))) {
          const box = await row.boundingBox()
          assert.ok(box && box.y >= areaBox.y && box.y + box.height <= areaBox.y + areaBox.height, 'Three useful task rows must fit before scrolling')
        }
        assert.ok(firstBox.y < 300, 'First task must appear near the top of a phone work surface')
        await expect(page.locator('.react-flow')).toHaveCount(1)
        await expect(page.locator('[role="region"][aria-label="Workspace canvas"]')).not.toBeVisible()
      }
      await expect(page.getByRole('button', { name: 'New task', exact: true })).toHaveCount(1)
      await expect(workArea.getByRole('textbox', { name: 'Filter tasks', exact: true })).not.toBeVisible()

      await workArea.locator('summary').filter({ hasText: 'Filters' }).click()
      await workArea.getByLabel('Task priority filter', { exact: true }).selectOption('high')
      await expect(workArea.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
      await workArea.getByRole('button', { name: 'Clear filters', exact: true }).click()
      await expect(workArea.getByLabel('Task priority filter', { exact: true })).toHaveValue('all')
      await workArea.locator('summary').filter({ hasText: 'Filters' }).click()
      await accessibility(page)
      await page.screenshot({ path: `${evidence}/canvas-dense-toolbar-${viewport.width}.png`, fullPage: true })
      const savedCamera = await page.locator('.react-flow__viewport').getAttribute('style')
      await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
      if (viewport.width < 640) await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', savedCamera)
      await navigateCanvas(page, name)
      await expectInsideCanvas(page, readySummary)
      await page.screenshot({ path: `${evidence}/canvas-dense-summary-${viewport.width}.png`, fullPage: true })
      log({ canvasImprovements: { viewport, contextualCreation: true, taskCount: 50, readyCount: 40, completedCount: 10, firstTaskVisible: true, threeCompactRowsVisible: true, editorTitleOffset: titleBox.y - dialogBox.y, denseGroupHeight: groupBox.height, canvasHeight: canvasBox.height } })
      if (viewport.width < 640) {
        // Create by tapping the visible action, without entering a command query.
        await page.getByRole('region', { name: 'Canvas commands', exact: true }).getByRole('button', { name: 'New task', exact: true }).click()
        const phoneTaskTitle = `Phone created task ${randomUUID()}`
        await workArea.getByLabel('Task title', { exact: true }).fill(phoneTaskTitle)
        await expectTouchControl(workArea.getByRole('button', { name: 'Add', exact: true }))
        await workArea.getByRole('button', { name: 'Add', exact: true }).click()
        await expect.poll(async () => (await db`SELECT id FROM tasks WHERE workspace_id=${createdId} AND title=${phoneTaskTitle}`).length).toBe(1)
        await expect(workArea.getByLabel('Task title', { exact: true })).toHaveValue('')
        await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
        log({ canvasPhoneDirectCreate: { viewport, persistedTask: true } })
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await selectWorkspace(page, otherWorkspace)
    await canvasHeaderAction(page, 'Manage canvas')
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(sectionForLink.id)
    await panel.getByLabel(/Existing workspace members without section access/).check()
    await panel.getByRole('button', { name: 'Attach workspace', exact: true }).click()
    let otherAttachment
    await expect.poll(async () => {
      const [row] = await db`SELECT id FROM canvas_resources WHERE workspace_id=${otherWorkspace}`
      otherAttachment = row?.id
      return Boolean(otherAttachment)
    }).toBe(true)
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await selectWorkspace(page, workspace)
    await canvasHeaderAction(page, 'Manage canvas')
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(otherAttachment)
    await panel.getByRole('button', { name: `${otherWorkspaceName} invitations`, exact: true }).click()
    await expect(panel).not.toBeVisible()
    await expect(locationControl(page)).toHaveAttribute('data-workspace-id', otherWorkspace)
    await expect(workArea.getByRole('heading', { name: otherWorkspaceName, exact: true, level: 2 })).toBeVisible()
    await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('team')
    await page.getByRole('button', { name: 'Show canvas', exact: true }).click()
    await selectWorkspace(page, workspace)
    await member.goto(`${base}/canvas`)
    const memberSearch = member.getByRole('combobox', { name: 'Search commands and tasks', exact: true })
    await expect(memberSearch).toBeEnabled()
    await member.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toBeVisible()
    await memberSearch.fill('create')
    await expect(member.getByRole('option', { name: 'Create task', exact: true })).toHaveCount(0)
    const hiddenSearchResponse = member.waitForResponse(response => response.request().method() === 'POST'
      && Boolean(response.request().headers()['next-action']) && Boolean(response.request().postData()?.includes(sharedQuery)))
    await memberSearch.fill(sharedQuery)
    const hiddenSearchPayload = await (await hiddenSearchResponse).text()
    assert.equal(hiddenSearchPayload.includes(otherTitle), false)
    assert.equal(hiddenSearchPayload.includes(privateTitle), false)
    await expect(member.getByRole('option').filter({ hasText: otherTitle })).toHaveCount(0)
    await expect(member.getByRole('option').filter({ hasText: privateTitle })).toHaveCount(0)
    await memberSearch.fill('Publish handoff')
    await member.getByRole('option').filter({ hasText: 'Publish handoff' }).click()
    const details = member.getByRole('dialog', { name: 'Task details', exact: true })
    await expect(details.getByLabel('Title', { exact: true })).toBeDisabled()
    await expect(details.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
    await expect(details.getByRole('textbox', { name: /comment/i })).toHaveCount(0)
    await member.keyboard.press('Escape')
    await expect(details).not.toBeVisible()
    log({ canvasStage: 'read-only-ready-waiting-inspection' })
    await navigateCanvas(member, 'Ready Waiting acceptance')
    await openWorkspaceTools(member)
    const memberWork = member.getByRole('complementary', { name: 'Workspace work area', exact: true })
    await memberWork.getByLabel('Workspace tools', { exact: true }).selectOption('ready')
    await expect(memberWork.getByLabel('Workspace tools', { exact: true })).toHaveValue('ready')
    await expect(memberWork.getByRole('region', { name: 'Waiting', exact: true })).toContainText('Approve brief')
    await expect(memberWork).toContainText('QA member')
    await expect(memberWork).not.toContainText(users[1].email)
    await expect(memberWork.getByRole('button', { name: /Edit prerequisites for/ })).toHaveCount(0)
    await expect(memberWork.getByLabel('Task to inspect', { exact: true })).toHaveCount(0)
    await accessibility(member)
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
    // This fresh visit can restore a task-focused camera. Establish visibility again
    // so culling cannot make the later revocation assertion pass before access changes.
    await member.getByRole('button', { name: 'Fit View', exact: true }).click()
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toBeVisible()
    await member.evaluate(id => {
      const source = new EventSource(`/api/realtime?workspaceId=${id}`)
      window.__canvasAccessProbe = { source, connected: false, errors: 0 }
      source.onmessage = event => { if (JSON.parse(event.data).type === 'connected') window.__canvasAccessProbe.connected = true }
      source.onerror = () => { window.__canvasAccessProbe.errors++ }
    }, workspace)
    await expect.poll(() => member.evaluate(() => window.__canvasAccessProbe.connected)).toBe(true)
    await canvasHeaderAction(page, 'Manage canvas')
    const [section] = await db`SELECT id FROM canvas_resources WHERE organization_id=${companyId} AND name=${sectionName}`
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(section.id)
    const grant = panel.locator('section').filter({ has: page.getByRole('heading', { name: 'Explicit grants', exact: true }) }).locator('div.rounded-lg').filter({ hasText: 'QA member' })
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await grant.getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect.poll(async () => (await member.request.get(`${base}/api/usage?workspaceId=${workspace}`)).status()).toBe(403)
    await expect.poll(() => member.evaluate(() => window.__canvasAccessProbe.errors), { timeout: 15000 }).toBeGreaterThan(0)
    await expect(member.locator(`.react-flow__edge[data-id="association:${referenceId}"]`)).toHaveCount(0)
    await expect(memberSearch).toBeEnabled()
    const revokedSearchResponse = member.waitForResponse(response => response.request().method() === 'POST'
      && Boolean(response.request().headers()['next-action']) && Boolean(response.request().postData()?.includes('Publish handoff')))
    await memberSearch.fill('Publish handoff')
    const revokedSearchPayload = await (await revokedSearchResponse).text()
    assert.equal(revokedSearchPayload.includes('Publish handoff'), false)
    await expect(member.getByRole('option').filter({ hasText: 'Publish handoff' })).toHaveCount(0)
    await member.evaluate(() => { window.__canvasAccessProbe.source.close(); delete window.__canvasAccessProbe })
    log({ canvas: { deterministicCreate: true, scopedSearch: true, crossWorkspaceSearch: true, privateSearchExcluded: true, invitationTargetMatchesSelection: true, sectionExploration: true, draftRecovery: true, reviewDraftRemount: true, resizedTaskControlsInsideCanvas: true, mobileCanvasPreserved: true, desktopMobileAccessibility: true, reducedMotion: true, sectionReadOnly: true, legacyReadOnly: true, referenceRoundtrip: true, realtimeRevocation: true } })
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
    // Recover IDs even when the UI assertion failed immediately after creation.
    for (const name of createdWorkspaceNames) {
      const rows = await db`SELECT id FROM workspaces WHERE name=${name} AND owner_user_id=${users[0].id}`
      for (const row of rows) if (!createdWorkspaces.includes(row.id)) createdWorkspaces.push(row.id)
    }
    for (const id of [otherWorkspace, privateWorkspace, ...createdWorkspaces]) {
      await db.begin(async tx => {
        await tx`DELETE FROM activity_events WHERE workspace_id=${id}`
        await tx`DELETE FROM outbox_events WHERE workspace_id=${id}`
        await tx`DELETE FROM workspaces WHERE id=${id}`
      })
      assert.equal((await db`SELECT id FROM workspaces WHERE id=${id}`).length, 0)
      await bridge.command(['DEL', `stream:${id}`])
      const hash = createHash('sha256').update(`invite-workspace:${id}`).digest('hex').slice(0, 16)
      const prefix = `rate:${hash}:`
      let cursor = '0'
      do {
        const scan = await bridge.command(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 100])
        cursor = String(scan[0])
        for (const key of scan[1]) if (key.startsWith(prefix)) await bridge.command(['DEL', key])
      } while (cursor !== '0')
    }
  }
}
