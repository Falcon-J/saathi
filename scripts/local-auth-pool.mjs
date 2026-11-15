import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'

const configuration = readFileSync(new URL('../supabase/local-auth-pool.conf', import.meta.url), 'utf8')
const configurationHash = createHash('sha256').update(configuration).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('docker', args, { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error('Local Auth container operation failed')) : resolve(args[0] === 'logs' ? `${stdout}\n${stderr}` : stdout))
    child.stdin?.end(input)
  })
}
const fileOperation = `set -eu
mode="$1"; owned="$2"
case "$mode" in
install)
  umask 077
  (set -C; cat > "$owned")
  chmod 644 "$owned"
  if [ -L /.env ] || { [ -e /.env ] && [ ! -f /.env ]; }; then exit 1; fi
  if [ -e /.env ]; then cmp -s "$owned" /.env; printf reused
  else ln -T "$owned" /.env; printf created; fi;;
rollback)
  if [ ! -L /.env ] && [ -f /.env ] && [ /.env -ef "$owned" ] && [ "$(sha256sum "$owned" | cut -d ' ' -f 1)" = "$3" ]; then rm -- /.env; printf removed; else printf preserved; fi;;
cleanup) rm -f -- "$owned";;
*) exit 1;;
esac`

/** CLI Auth v2.197 otherwise retains no idle connections. Never touches hosted Auth. */
export async function configureLocalAuthPool({ project = 'saathi-qa-20261105', apiOrigin = 'http://127.0.0.1:56321', run = docker,
  healthy = async origin => { try { return (await fetch(`${origin}/auth/v1/health`, { signal: AbortSignal.timeout(2000) })).ok } catch { return false } }, sleep = pause } = {}) {
  let id, owned, created = false, phase = 'target validation'
  try {
    const api = new URL(apiOrigin)
    if (!['saathi-qa-20261105', 'saathi-performance-ci'].includes(project) || api.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(api.hostname) || api.port !== '56321' || api.pathname !== '/' || api.username || api.password || api.search || api.hash) throw Error()
    const [container] = JSON.parse(await run(['inspect', `supabase_auth_${project}`]))
    const env = Object.fromEntries(container.Config.Env.map(value => { const index = value.indexOf('='); return [value.slice(0, index), value.slice(index + 1)] }))
    const database = new URL(env.GOTRUE_DB_DATABASE_URL)
    if (!/^[a-f0-9]{64}$/.test(container.Id) || !container.State.Running || container.Config.WorkingDir !== '/' || !container.Config.Image.endsWith('/supabase/gotrue:v2.197.0') || container.Config.Labels?.['com.supabase.cli.project'] !== project || !container.NetworkSettings.Networks[`supabase_network_${project}`]
      || database.hostname !== `supabase_db_${project}` || database.port !== '5432' || database.pathname !== '/postgres' || database.username !== 'supabase_auth_admin' || !['postgres:', 'postgresql:'].includes(database.protocol)
      || (env.GOTRUE_DB_CONN_PERCENTAGE !== undefined && env.GOTRUE_DB_CONN_PERCENTAGE !== '0') || ['GOTRUE_DB_MAX_POOL_SIZE', 'GOTRUE_DB_MAX_IDLE_POOL_SIZE'].some(key => env[key] !== undefined && env[key] !== '10')) throw Error()
    id = container.Id
    owned = `/tmp/saathi-auth-pool-${randomUUID()}.env`
    phase = 'managed configuration installation'
    const installation = (await run(['exec', '--user', '0:0', '-i', id, 'sh', '-c', fileOperation, 'saathi-auth-pool', 'install', owned], configuration)).trim()
    created = installation === 'created'
    if (!['created', 'reused'].includes(installation)) throw Error()
    const effective = async inspected => {
      if (!Number.isFinite(Date.parse(inspected.State.StartedAt))) throw Error()
      const logs = await run(['logs', '--since', inspected.State.StartedAt, '--tail', '200', id])
      const rows = logs.split('\n').flatMap(line => { try { const row = JSON.parse(line); return Number.isFinite(Date.parse(row.time)) && row.limit_max_open_conns !== undefined && row.limit_max_idle_conns !== undefined ? [row] : [] } catch { return [] } })
      const latest = rows.sort((a, b) => Date.parse(a.time) - Date.parse(b.time)).at(-1)
      return latest?.limit_strategy === 'fixed' && latest.limit_max_open_conns === 10 && latest.limit_max_idle_conns === 10
    }
    phase = 'effective pool inspection'
    if (!await effective(container)) {
      phase = 'exact Auth restart'
      await run(['restart', id])
      phase = 'Auth health and fresh limits'
      let ready = false
      for (let attempt = 0; attempt < 30; attempt++) { if (await healthy(api.origin)) { ready = true; break } await sleep(1000) }
      const [restarted] = JSON.parse(await run(['inspect', id]))
      if (!ready || restarted.Id !== id || !restarted.State.Running || restarted.State.StartedAt === container.State.StartedAt || !await effective(restarted)) throw Error()
    } else if (!await healthy(api.origin)) throw Error()
    return { created, containerId: id, maxOpen: 10, maxIdle: 10 }
  } catch {
    if (id && owned) { try { const restored = await run(['exec', '--user', '0:0', id, 'sh', '-c', fileOperation, 'saathi-auth-pool', 'rollback', owned, configurationHash]); if (restored.trim() === 'removed') await run(['restart', id]) } catch { /* Report failure without exposing container diagnostics. */ } }
    throw new Error(`Local Auth pooling setup failed during ${phase}; preserve existing configuration`)
  } finally {
    if (id && owned) { try { await run(['exec', '--user', '0:0', id, 'sh', '-c', fileOperation, 'saathi-auth-pool', 'cleanup', owned]) } catch { throw new Error('Local Auth pooling temporary-file cleanup failed') } }
  }
}
