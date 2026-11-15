import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '../../lib/auth-simple'
import { createClient } from '../../lib/supabase/server'
import { resolveMcpAccountConfiguration } from '../../components/mcp/account-boundary'
import { listMcpConnections, recordedMcpClientIds } from '../../components/mcp/connections-data'
import { McpDisconnectForm } from '../../components/mcp/disconnect-form'

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
  const provider = await (async () => {
    try { const client = await createClient({ readOnly: true }); return await client.auth.oauth.listGrants() }
    catch { return { data: null, error: true } }
  })()
  const grants = provider.data ?? []
  const names = new Map(grants.map(grant => [grant.client.id, grant.client.name]))
  const recorded = await recordedMcpClientIds(session.id).catch(() => null)
  const orphaned = recorded ? grants.filter(grant => configuration.allowedClientIds.includes(grant.client.id) && !recorded.has(grant.client.id)) : []
  return <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/dashboard" className="text-sm text-primary underline underline-offset-4">Back to workspace</Link>
    <h1 className="text-2xl font-semibold">Agent connections</h1>
    {configuration.status !== 'enabled' && <p role="status" className="alert rounded-lg border border-border px-4 py-3 text-sm">{configuration.status === 'disabled' ? 'Agent access disabled' : 'Agent access unavailable'}</p>}
    {(provider.error || !recorded) && <p role="alert">OAuth connection details are unavailable. You can still stop application access below.</p>}
    {page.items.length === 0 && orphaned.length === 0 && <p>No agent connections.</p>}
    {page.items.map(connection => {
      const expired = connection.expired
      const inactive = connection.revokedAt !== null || expired
      return <section key={connection.id} className="space-y-3 rounded-xl border border-border p-5">
        <h2 className="break-all text-lg font-semibold">{names.get(connection.clientId) || connection.clientId}</h2>
        <p>{connection.revokedAt ? 'Application access revoked' : expired ? 'Application access expired' : 'Application access active'}</p>
        <p className="text-sm">{connection.workspaceIds === null ? 'All currently authorized workspaces, including future workspaces' : `${connection.workspaceIds.length} selected workspaces`}</p>
        {connection.expiresAt && <p className="text-sm">Expires {new Date(connection.expiresAt).toLocaleString('en-IN', { timeZone: 'UTC' })} UTC</p>}
        <details><summary className="cursor-pointer text-sm">Permissions</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{connection.capabilities.map(capability => { const [area, permission] = capability.split(':'); const verbs: Record<string, string> = { read: 'Read', write: 'Create and edit', delete: 'Delete', archive: 'Archive', transfer: 'Transfer ownership of', revoke: 'Revoke' }; return <li key={capability}>{permissionLabels[capability] ?? `${verbs[permission] ?? permission} ${area.replaceAll('_', ' ')}`}</li> })}</ul></details>
        <McpDisconnectForm clientId={connection.clientId} cleanupOnly={inactive} />
      </section>
    })}
    {orphaned.map(grant => <section key={grant.client.id} className="space-y-3 rounded-xl border border-border p-5"><h2 className="text-lg font-semibold">{grant.client.name}</h2><p>No application access. Disconnect the retained OAuth consent before reconnecting.</p><McpDisconnectForm clientId={grant.client.id} cleanupOnly /></section>)}
    {page.next && <Link href={'/connections?after=' + encodeURIComponent(page.next)} className="text-primary underline">More connections</Link>}
  </main>
}
