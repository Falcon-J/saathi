import { headers } from 'next/headers'
import { getSession } from '../../lib/auth-simple'
import { resolveMcpConfig } from '../../features/mcp/config'
import type { EnabledMcpConfig } from '../../features/mcp/config'
import { createClient } from '../../lib/supabase/server'

export type McpAccountConfiguration =
  | { status: 'enabled'; config: EnabledMcpConfig; allowedClientIds: readonly string[] }
  | { status: 'disabled' | 'unavailable'; config: null; allowedClientIds: readonly string[] }

/** Recovery can retain a known operator allowlist even when the endpoint is disabled.
 * A malformed list never authorizes orphaned provider cleanup. */
export function resolveMcpAccountConfiguration(env: Readonly<Record<string, string | undefined>> = process.env): McpAccountConfiguration {
  const ids = [...new Set((env.MCP_OAUTH_CLIENT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean))]
  const allowedClientIds = ids.every(value => /^[a-zA-Z0-9._-]{1,200}$/.test(value)) ? ids : []
  try {
    const config = resolveMcpConfig(env)
    return config.enabled ? { status: 'enabled', config, allowedClientIds: config.clientIds } : { status: 'disabled', config: null, allowedClientIds }
  } catch { return { status: 'unavailable', config: null, allowedClientIds } }
}

async function requireLiveAccount(fallbackResource?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? fallbackResource ?? process.env.MCP_RESOURCE_URL
  if (!configured) throw new Error('Application origin is unavailable')
  const app = new URL(configured)
  if (app.username || app.password || !(app.protocol === 'https:' || app.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(app.hostname))) throw new Error('Application origin is unavailable')
  const origin = (await headers()).get('origin')
  if (!origin || new URL(origin).origin !== app.origin) throw new Error('Request origin is unavailable')
  const session = await getSession()
  if (!session) throw new Error('Sign in to manage connections')
  return session
}

/** New consent remains unavailable unless all endpoint configuration is valid. */
export async function requireMcpAccountAction() {
  const state = resolveMcpAccountConfiguration()
  if (state.status !== 'enabled') throw new Error('Agent connections are unavailable')
  const session = await requireLiveAccount(state.config.resource)
  const client = await createClient()
  return { config: state.config, session, client }
}

/** Disconnect authenticates the live cookie actor independently of endpoint activation.
 * Provider creation is deferred until after the caller has stopped local application access. */
export async function requireMcpDisconnectAction() {
  const state = resolveMcpAccountConfiguration()
  const session = await requireLiveAccount(state.config?.resource)
  return { session, allowedClientIds: state.allowedClientIds, getProviderClient: () => createClient() }
}
