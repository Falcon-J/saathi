import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createClient } from '@supabase/supabase-js'

// This runner only touches the isolated CLI stack, never the project's hosted env files.
const base = 'http://127.0.0.1:3101'
const workspace = randomUUID(), users = [], contexts = []
let phase = 'local-stack-status', db, admin, browser, server, failed = false, serverOutput = '', startupStatus = null
function log(result) { console.log(JSON.stringify({ scope: 'local signed-in acceptance', phase, result })) }
function capture(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.resume()
    child.on('error', () => reject(new Error('child-process-failed')))
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('child-process-failed')))
  })
}
function loopback(value, protocols) {
  const url = new URL(value)
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
  assert.ok(protocols.includes(url.protocol))
  return value
}
async function login(user, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport }); contexts.push(context)
  const page = await context.newPage()
  await page.goto(`${base}/login`)
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60000 })
  return page
}
async function board(page) {
  await expect(page.getByLabel('Current workspace')).toBeVisible({ timeout: 60000 })
  await page.getByLabel('Current workspace').selectOption(workspace)
  await page.getByRole('button', { name: 'Board', exact: true }).filter({ visible: true }).click()
  await expect(page.getByLabel('Task title', { exact: true })).toBeVisible()
}
async function layout(page) {
  const dimensions = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
  assert.ok(dimensions[0] <= dimensions[1])
  const proxySelector = '[role="region"]:has(> [data-slot="toast-viewport"]) > span[aria-hidden="true"][tabindex="0"]'
  const proxies = page.locator(proxySelector)
  const proxyCount = await proxies.count()
  for (let i = 0; i < proxyCount; i++) {
    await page.getByLabel('Task title', { exact: true }).focus()
    // Playwright focus() fires twice; native entry must fire once before real Tab navigation.
    await proxies.nth(i).evaluate(element => element.focus())
    const hiddenFocus = () => page.evaluate(selector => document.activeElement.matches(selector), proxySelector)
    assert.equal(await hiddenFocus(), false)
    await page.keyboard.press('Tab')
    assert.equal(await hiddenFocus(), false)
    await page.keyboard.press('Shift+Tab')
    assert.equal(await hiddenFocus(), false)
  }
  await page.getByLabel('Task title', { exact: true }).focus()
  // Exclude only Radix's sentinels after proving that they redirect keyboard focus.
  const scan = new AxeBuilder({ page })
  if (proxyCount) scan.exclude(proxySelector)
  const results = await scan.analyze()
  assert.deepEqual(results.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => v.id), [])
  log({ accessibility: 'passed', verifiedToastFocusProxies: proxyCount })
}
try {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx'
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx.cmd --yes supabase@2.120.0 status --workdir .local-test/supabase-acceptance -o json']
    : ['--yes', 'supabase@2.120.0', 'status', '--workdir', '.local-test/supabase-acceptance', '-o', 'json']
  const status = JSON.parse(await capture(command, args))
  const api = loopback(status.API_URL, ['http:'])
  const database = loopback(status.DB_URL, ['postgresql:', 'postgres:'])
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY
  const adminKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY
  assert.ok(publicKey && adminKey)
  log('passed')
  phase = 'migrations'
  await capture(process.execPath, ['scripts/migrate-database.mjs'], { ...process.env, DATABASE_MIGRATION_URL: database })
  log('passed')
  db = postgres(database, { max: 1, prepare: false })
  admin = createClient(api, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
  phase = 'disposable-admin-auth-fixtures'
  for (const role of ['owner', 'member', 'outsider']) {
    const user = { role, email: `qa-${randomUUID()}@example.test`, password: `${randomUUID()}Aa9!` }
    const result = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, user_metadata: { username: `QA ${role}` } })
    assert.equal(result.error, null)
    user.id = result.data.user.id; users.push(user)
  }
  await db.begin(async tx => {
    await tx`INSERT INTO workspaces(id,name,owner_user_id) VALUES(${workspace},'Disposable local acceptance',${users[0].id})`
    for (const user of users.slice(0, 2)) await tx`INSERT INTO workspace_members(workspace_id,user_id) VALUES(${workspace},${user.id})`
  })
  log('passed')
  phase = 'isolated-next-server'
  const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: database, DATABASE_MIGRATION_URL: database,
    NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    NEXT_PUBLIC_APP_URL: base, APP_URL: base, ENABLE_AI_WORKSPACE: 'false', NEXT_PUBLIC_ENABLE_AI_WORKSPACE: 'false',
    UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:1', UPSTASH_REDIS_REST_TOKEN: '',
    KV_REST_API_URL: 'http://127.0.0.1:1', KV_URL: 'http://127.0.0.1:1', KV_REST_API_TOKEN: '', GROQ_API_KEY: '' }
  server = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run dev -- --hostname 127.0.0.1 --port 3101'], { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3101'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] })
  const remember = chunk => { serverOutput = (serverOutput + chunk).slice(-128000) }
  server.stdout.on('data', remember); server.stderr.on('data', remember)
  server.on('error', () => { failed = true })
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (failed || server.exitCode !== null) throw new Error('server-start-failed')
    try { const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000) }); startupStatus = response.status; ready = response.ok } catch { /* compilation in progress */ }
    if (ready) break
    await delay(1000)
  }
  assert.ok(ready)
  log('passed')
  browser = await chromium.launch({ headless: true })
  phase = 'owner-ui-login-refresh-persistence'
  const owner = await login(users[0]); await board(owner)
  await owner.reload(); await board(owner); log('passed')
  phase = 'owner-create-assign-member-complete'
  const title = 'Disposable acceptance task'
  await owner.getByLabel('Task title', { exact: true }).fill(title)
  await owner.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(owner.getByLabel(`Assign ${title}`, { exact: true })).toBeVisible({ timeout: 30000 })
  await owner.getByLabel(`Assign ${title}`, { exact: true }).selectOption(users[1].email)
  await expect.poll(async () => (await db`SELECT assignee_user_id FROM tasks WHERE workspace_id=${workspace} AND title=${title}`)[0]?.assignee_user_id).toBe(users[1].id)
  const member = await login(users[1]); await board(member)
  await member.getByRole('button', { name: `Complete ${title}`, exact: true }).click()
  await expect.poll(async () => (await db`SELECT status FROM tasks WHERE workspace_id=${workspace} AND title=${title}`)[0]?.status).toBe('done')
  await owner.reload(); await board(owner)
  await expect(owner.getByRole('button', { name: `Reopen ${title}`, exact: true })).toBeVisible()
  log('passed')
  phase = 'outsider-workspace-isolation'
  const outsider = await login(users[2])
  await expect(outsider.getByLabel('Current workspace')).toHaveCount(0)
  assert.equal((await outsider.request.get(`${base}/api/usage?workspaceId=${workspace}`)).status(), 403)
  log('passed')
  phase = 'signed-desktop-accessibility-layout'
  await layout(owner); log('passed')
  phase = 'signed-mobile-accessibility-layout-keyboard'
  const mobile = await login(users[0], { width: 360, height: 800 }); await board(mobile)
  await layout(mobile)
  await mobile.getByLabel('Task title', { exact: true }).focus(); await mobile.keyboard.press('Tab')
  await expect(mobile.getByRole('button', { name: 'Add details', exact: true })).toBeFocused()
  log('passed')
  phase = 'dirty-editor-discard-keyboard'
  await mobile.getByRole('button', { name: `Edit ${title}`, exact: true }).click()
  const editor = mobile.getByRole('dialog', { name: 'Edit task', exact: true })
  await editor.getByLabel('Title', { exact: true }).fill('Retained unsaved acceptance draft')
  await mobile.keyboard.press('Escape')
  const discard = mobile.getByRole('alertdialog', { name: 'Discard unsaved changes?', exact: true })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(discard).not.toBeVisible()
  await expect(editor.getByLabel('Title', { exact: true })).toHaveValue('Retained unsaved acceptance draft')
  await expect.poll(() => editor.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await mobile.keyboard.press('Tab')
  await expect.poll(() => editor.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await mobile.keyboard.press('Escape')
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(editor).not.toBeVisible()
  log('passed')
  phase = 'activity-older-than-100'
  const fixtures = Array.from({ length: 105 }, (_, i) => ({ id: randomUUID(), workspace_id: workspace, actor_user_id: users[0].id,
    event_type: 'task-updated', entity_type: 'task', entity_id: randomUUID(), metadata: { action: `Acceptance event ${i}` }, created_at: new Date(Date.now() - i * 1000) }))
  await db`INSERT INTO activity_events ${db(fixtures)}`
  await owner.goto(`${base}/dashboard#activity-history`)
  const history = owner.getByRole('region', { name: 'Activity and history', exact: true })
  await expect(history.locator('li')).toHaveCount(50, { timeout: 30000 })
  for (let page = 0; page < 5; page++) {
    const more = history.getByRole('button', { name: 'Load older activity', exact: true })
    if (await more.count() === 0) break
    const count = await history.locator('li').count()
    await more.click()
    await expect.poll(() => history.locator('li').count()).toBeGreaterThan(count)
  }
  for (let i = 0; i < fixtures.length; i++) await expect(history.getByText(new RegExp(`acceptance event ${i}$`, 'i'))).toBeVisible()
  await expect(history.getByRole('button', { name: 'Load older activity', exact: true })).toHaveCount(0)
  log('passed')
} catch {
  if (phase === 'isolated-next-server') console.log(JSON.stringify({ phase, startupStatus, childExit: server?.exitCode,
    addressInUse: serverOutput.includes('EADDRINUSE'), lockConflict: serverOutput.includes('Unable to acquire lock'),
    environmentError: serverOutput.includes('Environment configuration error'), buildError: serverOutput.includes('Build Error'),
    moduleMissing: serverOutput.includes('Module not found'), turbopackError: serverOutput.includes('Turbopack error') }))
  failed = true; log('failed'); process.exitCode = 1
} finally {
  phase = 'cleanup'
  await Promise.allSettled(contexts.map(context => context.close())); await browser?.close()
  if (server?.pid) {
    if (process.platform === 'win32') await capture('taskkill.exe', ['/pid', String(server.pid), '/t', '/f']).catch(() => {})
    else server.kill('SIGTERM')
  }
  try {
    if (db) {
      await db`DELETE FROM activity_events WHERE workspace_id=${workspace}`
      await db`DELETE FROM outbox_events WHERE workspace_id=${workspace}`
      await db`DELETE FROM workspaces WHERE id=${workspace}`
      for (const user of users) {
        await db`DELETE FROM profiles WHERE id=${user.id}`
        assert.equal((await admin.auth.admin.deleteUser(user.id)).error, null)
      }
    }
    log('passed')
  } catch { log('failed'); process.exitCode = 1 }
  await db?.end()
}
