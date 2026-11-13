import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { expect as baseExpect } from '@playwright/test'

const expect = baseExpect.configure({ timeout: 30_000 })

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
    await expect(page).toHaveURL(`${base}/canvas`)
    await page.getByLabel('Current workspace', { exact: true }).selectOption(workspace)
    await expect(page.getByRole('region', { name: 'Workspace canvas', exact: true })).toBeVisible()
    log({ canvasStage: 'overview-cross-workspace-search' })
    await page.getByRole('navigation', { name: 'Canvas hierarchy', exact: true }).getByRole('button', { name: 'Canvas', exact: true }).click()
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
    await expect(page.getByLabel('Current workspace', { exact: true })).toHaveValue(otherWorkspace)
    await expect(crossWorkspaceEditor.getByLabel('Title', { exact: true })).toHaveValue(otherTitle)
    log({ canvasStage: 'cross-workspace-cancel-editor' })
    await crossWorkspaceEditor.getByRole('button', { name: 'Cancel', exact: true }).click()
    log({ canvasStage: 'cross-workspace-return-picker' })
    await page.getByLabel('Current workspace', { exact: true }).selectOption(workspace)
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
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
    await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(retainedDraft)
    page.once('dialog', dialog => dialog.accept())
    await page.reload()
    await expect(search).toBeEnabled()
    log({ canvasStage: 'reload-workspace-draft-recovery' })
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await page.locator(`.react-flow__node[data-id="workspace:${workspace}"]`).getByRole('button', { name: 'Open Ready Waiting acceptance', exact: true }).click()
    await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
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
    await page.getByRole('button', { name: 'Stop following', exact: true }).click()
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
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
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
    await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
    await expect(workArea).toBeVisible()
    await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('ready')
    await expect(workArea.getByRole('heading', { name: 'Ready and Waiting', exact: true })).toBeVisible()
    await expect(workArea.getByRole('region', { name: 'Waiting', exact: true })).toContainText('Approve brief')
    await expect.poll(async () => {
      const canvas = await page.getByRole('region', { name: 'Workspace canvas', exact: true }).boundingBox()
      const pane = await workArea.boundingBox()
      return Boolean(canvas && pane && canvas.height > 100 && pane.height >= 400 && canvas.y + canvas.height <= pane.y + 1)
    }).toBe(true)
    await accessibility(page)
    await page.screenshot({ path: `${evidence}/canvas-mobile.png`, fullPage: true })
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
    await page.goto(`${base}/dashboard`)
    await expect(page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true })).toHaveCount(1)
    await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Canvas', exact: true }).click()
    await expect(page).toHaveURL(`${base}/canvas`)
    await expect(search).toBeEnabled()
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'Manage canvas', exact: true }).click()
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
      const current = label => expect(hierarchy.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'location')
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
        await hierarchy.getByRole('button', { name: journeyWorkspace.name, exact: true }).click()
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
        await hierarchy.getByRole('button', { name: 'Canvas', exact: true }).click()
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
        assert.ok(gap >= 0 && gap <= 32, `Canvas-to-dock gap must be 0–32px; got ${gap}px`)
      })
      await phase('company-open-keyboard', () => openCard(`container:${companyId}`, companyName, 'keyboard'))
      await phase('space-open', () => openCard(`container:${spaceId}`, spaceName))
      await phase('section-open', () => openCard(`container:${sectionForLink.id}`, sectionName))
      await phase('workspace-open', async () => {
        await openCard(`workspace:${workspace}`, journeyWorkspace.name, 'heading')
        await expect(page.getByLabel('Current workspace', { exact: true })).toHaveValue(workspace)
      })
      if (viewport.width === 1280) await phase('exclude-task-from-board', async () => {
        await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
        await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
        await workArea.getByRole('textbox', { name: 'Search tasks', exact: true }).fill(`excluded-${agentRunId}`)
        await expect(workArea.getByText('Showing 0 matching tasks', { exact: true })).toBeVisible()
        const boardSpace = await workArea.locator('[aria-label="Task board"]').evaluate(grid => {
          const sections = [...grid.children].filter(child => child.tagName === 'SECTION').map(section => section.getBoundingClientRect())
          const template = getComputedStyle(grid).gridTemplateColumns
          return { columns: template.split(' ').length, template, minColumnWidth: Math.min(...sections.map(section => section.width)), emptySectionHeights: sections.map(section => section.height) }
        })
        log({ canvasBoardSpace: { viewport, ...boardSpace } })
        assert.equal(boardSpace.emptySectionHeights.length, 3)
        assert.ok(boardSpace.minColumnWidth >= 240, `Task columns must be at least 240px wide; got ${boardSpace.minColumnWidth}px`)
        assert.ok(boardSpace.emptySectionHeights.every(height => height < 288), 'Empty task sections must be shorter than 288px')
        await page.getByRole('button', { name: 'Close work area', exact: true }).click()
      })
      await phase('task-open', async () => {
        await openJourneyTask(true)
        await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(title)
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
        await expect.poll(async () => {
          const [row] = await db`SELECT description,status,version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
          return row && { description: row.description, status: row.status, version: row.version }
        }).toEqual({ description, status: 'in_progress', version: beforeEdit.version + 1 })
        await page.getByRole('button', { name: 'Close work area', exact: true }).click()
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
        await page.getByRole('button', { name: 'Close work area', exact: true }).click()
      })
      await phase('task-complete', async () => {
        await search.fill('complete')
        await page.getByRole('option', { name: `Complete ${title}`, exact: true }).click()
        await expect.poll(async () => {
          const [row] = await db`SELECT status,version FROM tasks WHERE workspace_id=${workspace} AND id=${agentTaskId}`
          return row && { status: row.status, version: row.version }
        }).toEqual({ status: 'done', version: beforeEdit.version + 3 })
        await current(title)
        await accessibility(page)
        await page.screenshot({ path: `${evidence}/canvas-hierarchy-${viewport.width}.png`, fullPage: true })
      })
      for (const [kind, label] of [['workspace', journeyWorkspace.name], ['section', sectionName], ['space', spaceName], ['company', companyName], ['canvas', 'Canvas']]) {
        await phase(`return-${kind}`, async () => {
          await hierarchy.getByRole('button', { name: label, exact: true }).click()
          await current(label)
          await expect(workArea).not.toBeVisible()
        })
      }
      if (viewport.width === 1280) await phase('reset-board-filter', async () => {
        await page.locator(`.react-flow__node[data-id="workspace:${workspace}"]`).getByRole('button', { name: `Open ${journeyWorkspace.name}`, exact: true }).click()
        await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
        await workArea.getByLabel('Workspace tools', { exact: true }).selectOption('tasks')
        await workArea.getByRole('textbox', { name: 'Search tasks', exact: true }).fill('')
        await expect(workArea.getByText(/^Showing [1-9]\d* matching tasks?(?: so far)?$/)).toBeVisible()
        await page.getByRole('button', { name: 'Close work area', exact: true }).click()
        await hierarchy.getByRole('button', { name: 'Canvas', exact: true }).click()
        await current('Canvas')
      })
    }
    // Verify the three density/context improvements with real Auth and database writes.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 800 }]) {
      await page.setViewportSize(viewport)
      await hierarchy.getByRole('button', { name: 'Canvas', exact: true }).click()
      for (const [id, label] of [[companyId, companyName], [spaceId, spaceName], [sectionForLink.id, sectionName]]) {
        await page.locator(`.react-flow__node[data-id="container:${id}"]`).getByRole('button', { name: `Open ${label}`, exact: true }).click()
      }
      log({ canvasImprovementStep: { viewport, step: 'contextual-create' } })
      const name = `Context workspace ${viewport.width} ${randomUUID()}`
      createdWorkspaceNames.push(name)
      await page.getByRole('button', { name: 'Create workspace', exact: true }).click()
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
      await expect(page.getByLabel('Current workspace', { exact: true })).toHaveValue(createdId)
      await expect(hierarchy.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'location')
      const denseTasks = Array.from({ length: 50 }, (_, index) => ({ id: randomUUID(), title: `Dense task ${String(index).padStart(2, '0')}`, status: index < 40 ? 'todo' : 'done' }))
      await db.begin(async tx => {
        for (const task of denseTasks) await tx`INSERT INTO tasks(id,workspace_id,title,status,created_by_user_id) VALUES(${task.id},${createdId},${task.title},${task.status},${users[0].id})`
      })
      await page.getByRole('button', { name: 'Refresh canvas', exact: true }).click()
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
      await page.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
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
      if (viewport.width < 640) assert.ok(areaBox.height >= 400, 'Mobile work pane must provide at least 400px for task content')
      await workArea.locator('summary').filter({ hasText: 'Filters' }).click()
      await workArea.getByLabel('Task priority filter', { exact: true }).selectOption('high')
      await expect(workArea.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
      await workArea.getByRole('button', { name: 'Clear filters', exact: true }).click()
      await expect(workArea.getByLabel('Task priority filter', { exact: true })).toHaveValue('all')
      await workArea.locator('summary').filter({ hasText: 'Filters' }).click()
      await accessibility(page)
      await page.screenshot({ path: `${evidence}/canvas-dense-toolbar-${viewport.width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Close work area', exact: true }).click()
      await hierarchy.getByRole('button', { name, exact: true }).click()
      await expectInsideCanvas(page, readySummary)
      await page.screenshot({ path: `${evidence}/canvas-dense-summary-${viewport.width}.png`, fullPage: true })
      log({ canvasImprovements: { viewport, contextualCreation: true, taskCount: 50, readyCount: 40, completedCount: 10, firstTaskVisible: true, editorTitleOffset: titleBox.y - dialogBox.y, denseGroupHeight: groupBox.height, canvasHeight: canvasBox.height } })
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByLabel('Current workspace', { exact: true }).selectOption(otherWorkspace)
    await page.getByRole('button', { name: 'Manage canvas', exact: true }).click()
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
    await page.getByLabel('Current workspace', { exact: true }).selectOption(workspace)
    await page.getByRole('button', { name: 'Manage canvas', exact: true }).click()
    await panel.getByLabel('Company, section or workspace', { exact: true }).selectOption(otherAttachment)
    await panel.getByRole('button', { name: `${otherWorkspaceName} invitations`, exact: true }).click()
    await expect(panel).not.toBeVisible()
    await expect(page.getByLabel('Current workspace', { exact: true })).toHaveValue(otherWorkspace)
    await expect(workArea.getByRole('heading', { name: otherWorkspaceName, exact: true, level: 2 })).toBeVisible()
    await expect(workArea.getByLabel('Workspace tools', { exact: true })).toHaveValue('team')
    await page.getByRole('button', { name: 'Close work area', exact: true }).click()
    await page.getByLabel('Current workspace', { exact: true }).selectOption(workspace)
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
    await member.getByRole('navigation', { name: 'Canvas hierarchy', exact: true }).getByRole('button', { name: 'Ready Waiting acceptance', exact: true }).click()
    await member.getByRole('button', { name: 'Open workspace tools', exact: true }).click()
    const memberWork = member.getByRole('complementary', { name: 'Workspace work area', exact: true })
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
    await page.getByRole('button', { name: 'Manage canvas', exact: true }).click()
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
