// Real local Auth/Postgres/Redis acceptance; requires an existing production build.
// Usage: node scripts/verify-ready-waiting.mjs
// Override SAATHI_QA_SUPABASE_CLI or SAATHI_QA_PORT when needed. The port must match
// the build's NEXT_PUBLIC_APP_URL. No hosted env is read.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect as baseExpect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { startLocalRedisRest } from './local-redis-rest.mjs'

// Functional recovery waits are separate from the measured latency acceptance gate.
const expect = baseExpect.configure({ timeout: 30_000 })

const port = Number(process.env.SAATHI_QA_PORT || 3101)
assert.ok(Number.isInteger(port) && port > 1024 && port < 65536)
const base = `http://127.0.0.1:${port}`, workspace = randomUUID()
const evidence = resolve('.local-test', `ready-waiting-${workspace}`)
const revision = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 16)
const results = []
const users = [], contexts = [], secrets = [], rawStreamPages = []
const actionSamples = []
const requestSamples = new WeakMap()
let actionNames = {}
let db, admin, bridge, server, browser, page, phase = 'local-stack', failed = false
const log = result => { const record = { scope: 'ready-waiting-local', revision, phase, result }; results.push(record); console.log(JSON.stringify(record)) }
function capture(command, args) {
  return new Promise((resolveCapture, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Local CLI timed out; inspect Docker Desktop health')) }, 30000)
    let output = ''; child.stdout.on('data', chunk => { output += chunk }); child.stderr.resume()
    child.on('error', () => { clearTimeout(timer); reject(new Error('Local CLI could not start')) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolveCapture(output) : reject(new Error('Local CLI failed; inspect local container health')) })
  })
}
function local(value) {
  assert.equal(new URL(value).hostname, '127.0.0.1', 'Acceptance requires loopback services')
  return value
}
const nav = (p, name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).click()
const section = (p, name) => p.getByRole('region', { name, exact: true })
const card = (p, name, title) => section(p, name).locator('article').filter({ has: p.locator('p').filter({ hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) })
async function login(user) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); contexts.push(context)
  const p = await context.newPage(); p.setDefaultTimeout(30000)
  p.on('request', request => {
    const action = actionNames[request.headers()['next-action']]
    if (!action) return
    const sample = { actor: user.role, action, phase }
    actionSamples.push(sample); requestSamples.set(request, sample)
  })
  p.on('response', response => {
    const sample = requestSamples.get(response.request())
    if (!sample) return
    sample.status = response.status()
    sample.responseStartMs = Math.round(response.request().timing().responseStart)
  })
  p.on('requestfinished', request => {
    const sample = requestSamples.get(request)
    if (!sample) return
    const timing = request.timing()
    sample.elapsedMs = Math.round(timing.responseEnd)
  })
  await p.goto(`${base}/login`)
  await p.getByLabel('Email', { exact: true }).fill(user.email)
  await p.getByLabel('Password', { exact: true }).fill(user.password)
  await p.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(p).toHaveURL(/\/dashboard/, { timeout: 60000 })
  return p
}
async function overview(p) {
  await nav(p, 'Overview')
  await expect(p.getByLabel('Search next work')).toBeVisible()
}
async function edit(p, title, changes) {
  await nav(p, 'Board')
  await p.getByRole('button', { name: `Edit ${title}`, exact: true }).click()
  const dialog = p.getByRole('dialog', { name: 'Edit task', exact: true })
  for (const [label, value] of Object.entries(changes)) await dialog.getByLabel(label, { exact: true }).selectOption(value)
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}
async function accessibility(p) {
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow')
  const proxy = '[role="region"]:has(> [data-slot="toast-viewport"]) > span[aria-hidden="true"][tabindex="0"]'
  for (const sentinel of await p.locator(proxy).all()) {
    await sentinel.evaluate(element => element.focus())
    assert.equal(await p.evaluate(selector => document.activeElement.matches(selector), proxy), false)
  }
  const results = await new AxeBuilder({ page: p }).exclude(proxy).analyze()
  assert.deepEqual(results.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), [])
}
try {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'Node.js 22 or later is required for the Supabase SDK')
  const manifest = JSON.parse(readFileSync('.next/server/server-reference-manifest.json', 'utf8'))
  actionNames = Object.fromEntries(Object.entries(manifest.node).map(([id, value]) => [id, value.exportedName]))
  const cli = process.env.SAATHI_QA_SUPABASE_CLI
  const status = JSON.parse(await capture(cli || (process.platform === 'win32' ? 'cmd.exe' : 'npx'), cli
    ? ['status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']
    : process.platform === 'win32' ? ['/d', '/s', '/c', 'npx.cmd --yes supabase@2.120.0 status --workdir .local-test/supabase-acceptance -o json']
      : ['--yes', 'supabase@2.120.0', 'status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']))
  const api = local(status.API_URL), database = local(status.DB_URL)
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY, adminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY
  secrets.push(publicKey, adminKey, database)
  db = postgres(database, { max: 1, prepare: false })
  admin = createClient(api, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
  phase = 'fixtures'
  for (const role of ['owner', 'member', 'outsider']) {
    const user = { role, email: `qa-${randomUUID()}@example.test`, password: `${randomUUID()}Aa9!` }
    secrets.push(user.email, user.password)
    const result = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, user_metadata: { username: `QA ${role}` } })
    assert.equal(result.error, null); user.id = result.data.user.id; users.push(user)
  }
  await db.begin(async tx => {
    await tx`INSERT INTO workspaces(id,name,owner_user_id) VALUES(${workspace},'Ready Waiting acceptance',${users[0].id})`
    for (const user of users.slice(0, 2)) await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${workspace},${user.id})`
  }); log('passed')
  phase = 'production-server'
  await new Promise((resolveProbe, reject) => {
    const probe = net.createServer()
    probe.once('error', () => reject(new Error('Acceptance port is occupied')))
    probe.listen(port, '127.0.0.1', () => probe.close(resolveProbe))
  })
  const token = randomUUID(); secrets.push(token); bridge = await startLocalRedisRest({ token })
  const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: database, DATABASE_MIGRATION_URL: database,
    NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    NEXT_PUBLIC_APP_URL: base, APP_URL: base, UPSTASH_REDIS_REST_URL: bridge.url, UPSTASH_REDIS_REST_TOKEN: token,
    KV_REST_API_URL: bridge.url, KV_URL: bridge.url, KV_REST_API_TOKEN: token, CRON_SECRET: randomUUID(),
    GROQ_API_KEY: '', RESEND_API_KEY: '', ENABLE_AI_WORKSPACE: 'false', NEXT_PUBLIC_ENABLE_AI_WORKSPACE: 'false',
    ENABLE_RATE_LIMITING: 'true', ENABLE_REAL_TIME: 'true', USE_MOCK_REDIS: 'false' }
  for (const key of Object.keys(env)) if (key.startsWith('RATE_LIMIT_') || key.startsWith('SSE_') || key === 'LOAD_TEST_SECRET') delete env[key]
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, windowsHide: true, stdio: 'ignore' })
  await expect.poll(async () => {
    assert.equal(server.exitCode, null, 'Next server exited')
    try { return (await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) })).status } catch { return 0 }
  }, { timeout: 60000 }).toBe(200)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  page = await login(users[0]); await expect(page.getByLabel('Current workspace')).toHaveValue(workspace, { timeout: 30000 })
  await expect(page.getByLabel('Search next work')).toBeVisible()
  await expect.poll(() => actionSamples.filter(sample => sample.action === 'getTaskGraph').length).toBeGreaterThan(0)
  assert.equal(actionSamples.some(sample => sample.action === 'getTasks'), false, 'Initial Ready/Waiting must not fetch the full task list')
  log({ initialDashboardActions: actionSamples.map(({ action, elapsedMs }) => ({ action, elapsedMs })) })
  phase = 'create-and-assign'
  const titles = ['Approve brief', 'Collect research', 'Publish handoff']
  for (const title of titles) {
    await page.getByLabel('Task title', { exact: true }).fill(title)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(async () => (await db`SELECT id FROM tasks WHERE workspace_id=${workspace} AND title=${title}`).length).toBe(1)
  }
  const tasks = await db`SELECT id,title FROM tasks WHERE workspace_id=${workspace}`
  const id = title => tasks.find(task => task.title === title).id
  await edit(page, titles[0], { Assignee: users[1].email })
  await edit(page, titles[1], { Assignee: users[0].email })
  await overview(page); log('passed')
  phase = 'multiple-prerequisites'
  await page.getByRole('button', { name: `Edit prerequisites for ${titles[2]}`, exact: true }).click()
  for (const title of titles.slice(0, 2)) {
    await expect(page.getByLabel(`Prerequisite for ${titles[2]}`, { exact: true })).toBeEnabled()
    await page.getByLabel(`Prerequisite for ${titles[2]}`, { exact: true }).selectOption(id(title))
    await page.getByRole('button', { name: 'Add prerequisite', exact: true }).click()
    await expect(page.getByRole('button', { name: `Remove ${title} prerequisite`, exact: true })).toBeVisible()
  }
  await expect(card(page, 'Waiting', titles[2])).toContainText(users[1].email)
  await expect(card(page, 'Waiting', titles[2])).toContainText(users[0].email)
  await card(page, 'Waiting', titles[2]).getByRole('button', { name: titles[0], exact: true }).click()
  await expect(page.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue(titles[0])
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await overview(page)
  await page.getByRole('button', { name: `Open dependent ${titles[2]}`, exact: true }).first().click()
  await expect(page.getByRole('dialog').getByLabel('Title', { exact: true })).toHaveValue(titles[2])
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await overview(page); log('passed')
  phase = 'member-permissions-and-realtime'
  const member = await login(users[1]); await overview(member)
  await expect(member.getByRole('button', { name: `Edit prerequisites for ${titles[2]}`, exact: true })).toHaveCount(0)
  await member.getByLabel('Task to inspect').selectOption(id(titles[2]))
  await expect(member.getByRole('region', { name: `Prerequisites for ${titles[2]}`, exact: true })).toContainText('Only the task creator or workspace owner')
  await expect(member.getByRole('button', { name: 'Add prerequisite', exact: true })).toHaveCount(0)
  // Use the member's real browser cookies, alongside the normal page stream.
  // The raw uppercase URL must resolve to the canonical stream, not an empty alias.
  rawStreamPages.push(member)
  await member.evaluate(uppercaseWorkspace => {
    const source = new EventSource(`/api/realtime?workspaceId=${encodeURIComponent(uppercaseWorkspace)}`, { withCredentials: true })
    const probe = { source, connectedWorkspace: null, events: [] }
    window.__saathiQaUppercaseSse = probe
    source.onmessage = event => {
      let message
      try { message = JSON.parse(event.data) } catch { return }
      if (message.type === 'connected') probe.connectedWorkspace = message.data?.workspaceId ?? null
      if (typeof message.type === 'string' && message.type.startsWith('task-')) probe.events.push({
        type: message.type, workspaceId: message.workspaceId,
        taskId: message.data?.task?.id ?? message.data?.taskId,
        completed: message.data?.task?.completed, status: message.data?.task?.status,
      })
    }
  }, workspace.toUpperCase())
  await expect.poll(() => member.evaluate(() => window.__saathiQaUppercaseSse.connectedWorkspace), { timeout: 30000 }).toBe(workspace)
  const assigneePage = await member.context().newPage()
  await assigneePage.goto(`${base}/dashboard`); await nav(assigneePage, 'Board')
  await expect(assigneePage.getByRole('button', { name: `Edit ${titles[0]}`, exact: true })).toHaveCount(0)
  await assigneePage.getByRole('button', { name: `Complete ${titles[0]}`, exact: true }).click()
  await expect.poll(async () => (await db`SELECT status FROM tasks WHERE id=${id(titles[0])}`)[0]?.status).toBe('done')
  await expect.poll(() => member.evaluate(({ workspaceId, taskId }) => window.__saathiQaUppercaseSse.events.some(event =>
    event.workspaceId === workspaceId && event.taskId === taskId && (event.completed === true || event.status === 'done')),
  { workspaceId: workspace, taskId: id(titles[0]) }), { timeout: 30000 }).toBe(true)
  await member.evaluate(() => { window.__saathiQaUppercaseSse.source.close(); delete window.__saathiQaUppercaseSse })
  log({ uppercaseSse: { canonicalConnectedWorkspace: true, assignedTaskCompletionReceived: true } })
  await assigneePage.close()
  await expect(card(member, 'Waiting', titles[2]).locator('li').filter({ hasText: titles[0] })).toContainText('— Complete', { timeout: 30000 })
  await expect(card(member, 'Waiting', titles[2]).locator('li').filter({ hasText: titles[1] })).toContainText('— Not complete')
  await expect(card(member, 'Ready', titles[2])).toHaveCount(0)
  await edit(page, titles[1], { Status: 'done' })
  await expect(card(member, 'Ready', titles[2])).toBeVisible({ timeout: 30000 })
  await expect(card(member, 'Waiting', titles[2])).toHaveCount(0)
  await edit(page, titles[0], { Status: 'todo' })
  await expect(card(member, 'Waiting', titles[2])).toBeVisible({ timeout: 30000 }); log('passed')
  phase = 'search-and-outsider'
  await member.getByLabel('Search next work').fill(titles[2])
  await expect(card(member, 'Waiting', titles[2])).toBeVisible()
  await expect(card(member, 'Ready', titles[0])).toHaveCount(0)
  await member.getByLabel('Search next work').fill('')
  const outsider = await login(users[2])
  await expect(outsider.getByLabel('Current workspace')).toHaveCount(0)
  assert.equal((await outsider.request.get(`${base}/api/usage?workspaceId=${workspace}`)).status(), 403)
  log('passed')
  phase = 'draft-refresh-navigation-back'
  await overview(page)
  const draft = 'Retain unsaved handoff draft'
  await page.getByLabel('Task title', { exact: true }).fill(draft)
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.endsWith(':quick-add')))).toBe(true)
  page.once('dialog', dialog => dialog.dismiss()); await nav(page, 'Team')
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(draft)
  page.once('dialog', dialog => dialog.accept()); await page.reload()
  await expect(page.getByLabel('Task title', { exact: true })).toHaveValue(draft)
  page.once('dialog', dialog => dialog.accept()); await nav(page, 'Team')
  await overview(page); await nav(page, 'Board'); await nav(page, 'Team'); await page.goBack()
  await expect(page).toHaveURL(/#project-board$/); await expect(page.getByLabel('Task title', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Edit ${titles[2]}`, exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit task', exact: true })
  await editor.getByLabel('Title', { exact: true }).fill('Retained unsaved task editor')
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.endsWith(':task-editor')))).toBe(true)
  page.once('dialog', dialog => dialog.accept()); await page.reload()
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Retained unsaved task editor')
  await page.keyboard.press('Escape')
  const discard = page.getByRole('alertdialog', { name: 'Discard unsaved changes?', exact: true })
  await discard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Retained unsaved task editor')
  await expect.poll(() => editor.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape'); await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(editor).not.toBeVisible()
  assert.equal((await db`SELECT title FROM tasks WHERE id=${id(titles[2])}`)[0]?.title, titles[2])
  log('passed')
  phase = 'desktop-mobile-keyboard-accessibility'
  await overview(page); await accessibility(page)
  mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/desktop-waiting.png`, fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 }); await accessibility(page)
  const trigger = page.getByRole('button', { name: `Edit prerequisites for ${titles[2]}`, exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  const inspector = page.getByRole('region', { name: `Prerequisites for ${titles[2]}`, exact: true })
  await expect(inspector).toBeFocused()
  await inspector.getByRole('button', { name: 'Close prerequisites', exact: true }).click(); await expect(trigger).toBeFocused()
  await page.screenshot({ path: `${evidence}/mobile-waiting.png`, fullPage: true })
  log({ passed: true, evidence, realRedisRequests: bridge.requests })
  if (process.env.SAATHI_QA_CANVAS === 'true') {
    phase = 'canvas-workflow'
    const { verifyCanvasWorkflow } = await import('./verify-canvas-workflow.mjs')
    await verifyCanvasWorkflow({ page, member, db, workspace, users, base, accessibility, evidence, log })
  }
} catch (error) {
  failed = true
  let reason = String(error?.message || error)
  for (const value of secrets.filter(Boolean)) reason = reason.replaceAll(value, '[redacted]')
  log({ failed: true, reason: reason.slice(0, 2000) })
  if (page) { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true }).catch(() => {}) }
} finally {
  phase = 'cleanup'
  await Promise.allSettled(rawStreamPages.map(p => p.evaluate(() => { window.__saathiQaUppercaseSse?.source.close(); delete window.__saathiQaUppercaseSse })))
  await Promise.allSettled(contexts.map(context => context.close())); await browser?.close()
  if (server?.pid) {
    if (process.platform === 'win32') await capture('taskkill.exe', ['/pid', String(server.pid), '/t', '/f']).catch(() => {})
    else server.kill('SIGTERM')
  }
  try {
    if (db) {
      await db.begin(async tx => {
        await tx`DELETE FROM activity_events WHERE workspace_id=${workspace}`
        await tx`DELETE FROM outbox_events WHERE workspace_id=${workspace}`
        await tx`DELETE FROM workspaces WHERE id=${workspace}`
        for (const user of users) await tx`DELETE FROM profiles WHERE id=${user.id}`
      })
      for (const user of users) assert.equal((await admin.auth.admin.deleteUser(user.id)).error, null)
      assert.equal((await db`SELECT id FROM workspaces WHERE id=${workspace}`).length, 0)
      for (const user of users) assert.equal((await db`SELECT id FROM auth.users WHERE id=${user.id}`).length, 0)
    }
    if (bridge) {
      const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
      const keys = new Set([`stream:${workspace}`]), scopes = [`invite-workspace:${workspace}`]
      for (const user of users) {
        scopes.push(`sse-attempt:${user.email}`)
        keys.add(`sse:connections:v2:${hash(user.email.trim().toLowerCase())}`)
        if (user.id) scopes.push(`tasks:${user.id}`, `invite-owner:${user.id}`, `invite-response:${user.id}`)
      }
      for (const scope of scopes) {
        const prefix = `rate:${hash(scope)}:`
        let cursor = '0'
        do {
          const scan = await bridge.command(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 100])
          cursor = String(scan[0]); for (const key of scan[1]) if (key.startsWith(prefix)) keys.add(key)
        } while (cursor !== '0')
      }
      for (const key of keys) await bridge.command(['DEL', key])
    }
    log('passed')
  } catch { failed = true; log('failed') }
  await db?.end(); await bridge?.close()
  mkdirSync(evidence, { recursive: true })
  writeFileSync(`${evidence}/results.json`, JSON.stringify({ revision, passed: !failed, results, actionSamples }, null, 2))
}
if (failed) process.exitCode = 1
