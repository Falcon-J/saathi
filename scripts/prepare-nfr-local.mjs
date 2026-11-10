// Prepare an already-running disposable local stack. Never writes credentials to disk.
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workdir = '.local-test/supabase-acceptance'
const inheritedNames = ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'CI', 'GITHUB_ACTIONS', 'NPM_CONFIG_CACHE', 'npm_config_cache']

export function runCommand(command, args, { env, capture = false, redactions = [], emit = value => process.stdout.write(value) }) {
  return new Promise((resolveCommand, reject) => {
    execFile(command, args, { env, windowsHide: true, timeout: 20 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!capture) {
        const clean = value => redactions.filter(Boolean).sort((a, b) => b.length - a.length).reduce((text, secret) => text.split(secret).join('[redacted]'), value)
        if (stdout) emit(clean(stdout))
        if (stderr) emit(clean(stderr))
      }
      if (error) reject(new Error('Local preparation command failed'))
      else resolveCommand(stdout)
    })
  })
}

function endpoint(value, protocols, port, path) {
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !protocols.includes(url.protocol)
    || url.port !== port || !path.includes(url.pathname) || url.search || url.hash
    || (url.protocol === 'http:' && (url.username || url.password))) throw new Error('Expected exact disposable loopback endpoint')
  return url
}

function publicKey(status) {
  const key = status.PUBLISHABLE_KEY || status.ANON_KEY
  if (typeof key !== 'string' || !key.trim()) throw new Error('Local public Auth key unavailable')
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return key
  try {
    const pieces = key.split('.')
    if (pieces.length === 3 && JSON.parse(Buffer.from(pieces[1], 'base64url').toString()).role === 'anon') return key
  } catch { /* Reject unrecognized or privileged keys without printing their contents. */ }
  throw new Error('Expected a public local Auth key')
}

export async function prepareNfr({ env = process.env, run = runCommand, log = value => console.log(value) } = {}) {
  let phase = 'local status validation'
  try {
    const base = Object.fromEntries(inheritedNames.filter(name => env[name] !== undefined).map(name => [name, env[name]]))
    const status = JSON.parse(await run(env.SAATHI_QA_SUPABASE_CLI || 'supabase', ['status', '--workdir', workdir, '-o', 'json'], { env: base, capture: true }))
    const api = endpoint(status.API_URL, ['http:'], '56321', ['', '/'])
    const database = endpoint(status.DB_URL, ['postgres:', 'postgresql:'], '56322', ['/postgres'])
    const key = publicKey(status)
    const redisToken = randomUUID(), cronSecret = randomUUID()
    const child = { ...base, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', SAATHI_BUILD_WORKERS: '1',
      DATABASE_URL: status.DB_URL, NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3101', APP_URL: 'http://127.0.0.1:3101',
      // Build-time placeholders only. The verifier creates its real Redis REST bridge.
      UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:56380', UPSTASH_REDIS_REST_TOKEN: redisToken,
      CRON_SECRET: cronSecret, ENABLE_AI_WORKSPACE: 'false', NEXT_PUBLIC_ENABLE_AI_WORKSPACE: 'false',
      GROQ_API_KEY: '', ENABLE_RATE_LIMITING: 'true', ENABLE_REAL_TIME: 'true', USE_MOCK_REDIS: 'false' }
    const redactions = [status.DB_URL, database.password, decodeURIComponent(database.password), key, status.SECRET_KEY, status.SERVICE_ROLE_KEY, status.JWT_SECRET, redisToken, cronSecret].filter(value => typeof value === 'string' && value.length > 0)
    phase = 'database migration'
    log('Applying application migrations to the disposable local Auth database')
    await run(process.execPath, ['scripts/migrate-database.mjs'], { env: { ...base, DATABASE_MIGRATION_URL: status.DB_URL }, redactions })
    phase = 'build environment validation'
    await run(process.execPath, ['scripts/validate-env.js'], { env: child, redactions })
    phase = 'production build'
    log(`Building the production app for loopback port ${api.port}`)
    await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: child, redactions })
    log('Disposable local production build prepared')
  } catch {
    throw new Error(`NFR preparation failed during ${phase}; inspect sanitized command diagnostics`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareNfr() }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
