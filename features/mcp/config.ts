export interface EnabledMcpConfig {
  enabled: true
  resource: string
  issuer: string
  jwksUrl: string
  clientIds: readonly string[]
}
export type McpConfig = EnabledMcpConfig | { enabled: false }

function canonicalUrl(value: string | undefined, development: boolean): URL {
  if (!value) throw new Error('MCP configuration is incomplete')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('MCP URL is invalid') }
  if (url.username || url.password || url.search || url.hash) throw new Error('MCP URL must not contain credentials, query or fragment')
  if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('MCP URLs must use HTTPS')
  return url
}

/** Resolve trusted deployment configuration only; never use request Host as authority. */
export function resolveMcpConfig(env: Readonly<Record<string, string | undefined>> = process.env): McpConfig {
  if (env.MCP_ENABLED === undefined || env.MCP_ENABLED === 'false') return { enabled: false }
  if (env.MCP_ENABLED !== 'true') throw new Error('MCP_ENABLED must be true or false')
  const development = env.NODE_ENV === 'development'
  const resource = canonicalUrl(env.MCP_RESOURCE_URL ?? (env.NEXT_PUBLIC_APP_URL ? new URL('/mcp', canonicalUrl(env.NEXT_PUBLIC_APP_URL, development)).href : undefined), development)
  const issuer = canonicalUrl(env.MCP_AUTHORIZATION_SERVER_URL ?? (env.NEXT_PUBLIC_SUPABASE_URL ? new URL('/auth/v1', canonicalUrl(env.NEXT_PUBLIC_SUPABASE_URL, development)).href : undefined), development)
  const clientIds = [...new Set((env.MCP_OAUTH_CLIENT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean))]
  if (!clientIds.length || clientIds.some(value => !/^[a-zA-Z0-9._-]{1,200}$/.test(value))) throw new Error('MCP OAuth client allowlist is required and must be valid')
  const normalizedIssuer = issuer.href.replace(/\/$/, '')
  return { enabled: true, resource: resource.href, issuer: normalizedIssuer, jwksUrl: normalizedIssuer + '/.well-known/jwks.json', clientIds }
}

/** Public OAuth discovery describes identity scopes separately from application grants. */
export function mcpProtectedResourceMetadata(config: EnabledMcpConfig) {
  return { resource: config.resource, authorization_servers: [config.issuer], bearer_methods_supported: ['header'] }
}
