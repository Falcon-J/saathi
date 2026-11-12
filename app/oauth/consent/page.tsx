import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '../../../lib/auth-simple'
import { createClient } from '../../../lib/supabase/server'
import { listWorkspaces } from '../../../lib/data/workspaces'
import { resolveMcpConfig } from '../../../features/mcp/config'
import { consentAuthorizationId, validateConsentDetails, validateExistingConsentRedirect, mcpRedirectUris, type ConsentDetails } from '../../../components/mcp/consent-service'
import { McpConsentForm } from '../../../components/mcp/consent-form'

export const dynamic = 'force-dynamic'

export default async function McpConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  let config
  try { config = resolveMcpConfig() } catch { return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Connections unavailable</h1><Link href="/dashboard">Back to workspace</Link></main> }
  if (!config.enabled) return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Agent connections are disabled</h1><Link href="/dashboard">Back to workspace</Link></main>
  const params = await searchParams
  let authorizationId: string
  try { authorizationId = consentAuthorizationId(params.authorization_id) } catch { return <main className="mx-auto max-w-2xl p-8"><h1 className="text-2xl font-semibold">Authorization unavailable</h1><p>Start a new connection from your agent.</p></main> }
  const session = await getSession()
  if (!session) redirect('/login?redirect=' + encodeURIComponent('/oauth/consent?authorization_id=' + authorizationId))
  let details: ConsentDetails, destination: string | null = null
  try {
    const client = await createClient({ readOnly: true })
    const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId)
    if (error || !data) throw new Error('Authorization unavailable')
    if ('redirect_url' in data) destination = validateExistingConsentRedirect(data.redirect_url, mcpRedirectUris())
    else details = validateConsentDetails(data, session.id, authorizationId, config.clientIds)
  } catch { return <main className="mx-auto max-w-2xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Authorization unavailable</h1><p>Start a new connection from your agent. If you previously revoked access, disconnect it in Connections before reconnecting.</p><Link href="/connections" className="underline">Connections</Link></main> }
  if (destination) redirect(destination)
  const workspaces = [...await listWorkspaces(session.id), ...await listWorkspaces(session.id, true)].map(workspace => ({ id: workspace.id, name: workspace.name }))
  return <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/dashboard" className="text-sm text-primary underline underline-offset-4">Back to workspace</Link>
    <h1 className="text-2xl font-semibold">Connect {details!.client.name}</h1>
    <p className="break-all text-sm text-muted-foreground">Return to {new URL(details!.redirect_uri).origin}</p>
    <McpConsentForm authorizationId={authorizationId} workspaces={workspaces} />
    <p className="text-sm">Identity information requested: {details!.scope || 'email'}. Application permissions are controlled separately above. Revoke access in <Link href="/connections" className="underline">Connections</Link>.</p>
  </main>
}
