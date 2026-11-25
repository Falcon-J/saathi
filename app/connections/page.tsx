import { listWorkspaces } from "../../lib/data/workspaces"
import { connectionWorkspaceNames } from "../../components/mcp/workspace-scope"
import Link from 'next/link'
import { AppPage } from '@/components/app-page'
import { redirect } from 'next/navigation'
import { getSession } from '../../lib/auth-simple'
import { createClient } from '../../lib/supabase/server'
import { resolveMcpAccountConfiguration } from '../../components/mcp/account-boundary'
import { listMcpConnections, recordedMcpClientIds } from '../../components/mcp/connections-data'
import { McpDisconnectForm } from '../../components/mcp/disconnect-form'
import { McpConnectionSetup } from '../../components/mcp/connection-setup'
import { groupConnectionPermissions } from '../../components/mcp/permission-groups'

export const dynamic = 'force-dynamic'

const permissionLabels: Record<string, string> = {
  'members:write': 'Remove members or leave workspaces', 'invitation_links:write': 'Create and accept invitation links',
  'invitations:write': 'Send, accept or decline invitations', 'workspaces:write': 'Create and edit workspaces',
  'workspaces:transfer': 'Transfer workspace ownership', 'imports:write': 'Import tasks',
  'tasks:write': 'Create, edit, assign and complete tasks', 'comments:write': 'Add comments', 'dependencies:write': 'Change task dependencies',
  'canvas:read': 'Read companies, sections and workspace placement', 'canvas:access_read': 'Review people, groups and access grants',
  'canvas:company_create': 'Create companies', 'canvas:container_create': 'Create spaces and sections',
  'canvas:workspace_attach': 'Place workspaces in sections and restrict visibility', 'canvas:member_add': 'Add company members',
  'canvas:group_create': 'Create company groups', 'canvas:group_member_set': 'Change group membership',
  'canvas:grant': 'Grant section and workspace access', 'canvas:revoke': 'Revoke section and workspace access',
  'canvas:policy_set': 'Change access inheritance and restrictions', 'canvas:reference_create': 'Place references on canvases',
  'agent_runs:read': 'Read agent work and evidence', 'agent_runs:write': 'Claim tasks and report agent work',
  'agent_runs:cancel': 'Cancel agent work', 'agent_runs:release': 'Release agent task claims',
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login?redirect=%2Fconnections')
  const configuration = resolveMcpAccountConfiguration()
  const { after } = await searchParams
  let page
  try { page = await listMcpConnections(session.id, after) } catch { return <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">Connections unavailable</h1><Link href="/connections" className="underline">Reload connections</Link></main> }
  const authorizedWorkspaces = await listWorkspaces(session.id).catch(() => null)
  const provider = await (async () => {
    try { const client = await createClient({ readOnly: true }); return await client.auth.oauth.listGrants() }
    catch { return { data: null, error: true } }
  })()
  const grants = provider.data ?? []
  const names = new Map(grants.map(grant => [grant.client.id, grant.client.name]))
  const recorded = await recordedMcpClientIds(session.id).catch(() => null)
  const orphaned = recorded ? grants.filter(grant => configuration.allowedClientIds.includes(grant.client.id) && !recorded.has(grant.client.id)) : []
  return <AppPage width="max-w-3xl" eyebrow="Connections" title="Agent connections" description="Agents reach Saathi over MCP. Each connection lists what it may do, and you can revoke it at any time.">
    {configuration.status === 'enabled' && <McpConnectionSetup resource={configuration.config.resource} />}
    {configuration.status !== 'enabled' && <p role="status" className="alert rounded-lg border border-border px-4 py-3 text-sm">{configuration.status === 'disabled' ? 'Agent access disabled' : 'Agent access unavailable'}</p>}
    {(provider.error || !recorded) && <p role="alert">OAuth connection details are unavailable. You can still stop application access below.</p>}
    {page.items.length === 0 && orphaned.length === 0 && <p>No agent connections.</p>}
    {page.items.map(connection => {
      const expired = connection.expired
      const inactive = connection.revokedAt !== null || expired
      return <section key={connection.id} className="space-y-3 rounded-xl border border-border p-5">
        <h2 className="break-words text-lg font-semibold">{names.get(connection.clientId) || 'Agent connection'}</h2>
        {!names.has(connection.clientId) && <p className="break-all font-mono text-xs text-muted-foreground">Client {connection.clientId}</p>}
        <p className="text-sm font-medium">{connection.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active'}</p>
        {connection.workspaceIds === null ? <p className="text-sm">All currently authorized workspaces, including future workspaces</p>
          : <details><summary className="cursor-pointer text-sm">{connection.workspaceIds.length} selected workspaces</summary>
            {authorizedWorkspaces ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{connectionWorkspaceNames(connection.workspaceIds, authorizedWorkspaces).map((name, index) => <li key={index}>{name}</li>)}</ul> : <p role="alert">Workspace names unavailable. Reload connections.</p>}
          </details>}
        {connection.expiresAt && <p className="text-sm">{expired ? 'Expired' : 'Expires'} <time dateTime={connection.expiresAt}>{new Date(connection.expiresAt).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC</time></p>}
        <details><summary className="cursor-pointer text-sm">Permissions</summary><div className="mt-3 space-y-4">{groupConnectionPermissions(connection.capabilities).map(group => <section key={group.label}><h3 className="text-sm font-medium">{group.label}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{group.scopes.map(capability => { const [area, permission] = capability.split(':'); const verbs: Record<string, string> = { read: 'Read', write: 'Create and edit', delete: 'Delete', archive: 'Archive', transfer: 'Transfer ownership of', revoke: 'Revoke' }; return <li key={capability}>{permissionLabels[capability] ?? `${verbs[permission] ?? permission} ${area.replaceAll('_', ' ')}`}</li> })}</ul></section>)}</div></details>
        {(!inactive || provider.error || names.has(connection.clientId)) && <McpDisconnectForm clientId={connection.clientId} cleanupOnly={inactive} />}
        {inactive && configuration.status === 'enabled' && <McpConnectionSetup resource={configuration.config.resource} reconnect retainedConsent={Boolean(provider.error) || names.has(connection.clientId)} />}
      </section>
    })}
    {orphaned.map(grant => <section key={grant.client.id} className="space-y-3 rounded-xl border border-border p-5"><h2 className="text-lg font-semibold">{grant.client.name}</h2><p>No application access. Disconnect the retained OAuth consent before reconnecting.</p><McpDisconnectForm clientId={grant.client.id} cleanupOnly /></section>)}
    {page.next && <Link href={'/connections?after=' + encodeURIComponent(page.next)} className="text-primary underline">More connections</Link>}
  </AppPage>
}
