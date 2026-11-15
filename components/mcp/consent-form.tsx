'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { submitMcpConsent } from '../../app/oauth/consent/actions'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Label } from '../ui/label'

export function McpConsentForm({ authorizationId, workspaces }: { authorizationId: string; workspaces: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(submitMcpConsent, {})
  const [allWorkspaces, setAllWorkspaces] = useState(false)
  return <form action={action} className="space-y-6">
    <input type="hidden" name="authorization_id" value={authorizationId} />
    <fieldset disabled={pending} className="space-y-4">
      <legend className="mb-3 font-semibold">Permissions</legend>
      <p className="text-sm">Read workspaces, tasks, comments, members, activity and agent progress in the scope you choose.</p>
      <div className="flex items-start gap-3"><Checkbox id="mcp-work-edits" name="work_edits" value="on" /><Label htmlFor="mcp-work-edits">Edit work: create and update workspaces and tasks, change dependencies, add comments, import tasks and report agent work.</Label></div>
      <div className="flex items-start gap-3"><Checkbox id="mcp-destructive" name="destructive" value="on" /><Label htmlFor="mcp-destructive">Allow destructive actions: archive or permanently delete work, revoke invitations, cancel agent runs or release claims. Deleted data cannot be recovered here.</Label></div>
      <div className="flex items-start gap-3"><Checkbox id="mcp-membership" name="membership" value="on" /><Label htmlFor="mcp-membership">Manage access: companies, sections, sharing, groups, invitations and workspace ownership. Removing access or attaching workspaces to sections also requires destructive access.</Label></div>
    </fieldset>
    <fieldset disabled={pending} className="space-y-3">
      <legend className="mb-3 font-semibold">Workspaces</legend>
      <div className="flex items-start gap-3"><Checkbox id="mcp-all-workspaces" name="all_workspaces" value="on" checked={allWorkspaces} onCheckedChange={value => setAllWorkspaces(value === true)} /><Label htmlFor="mcp-all-workspaces">All workspaces I can access, including future workspaces. Required to create workspaces, accept invitations into new ones, or manage companies and sections.</Label></div>
      {workspaces.map(workspace => <div key={workspace.id} className="flex items-center gap-3"><Checkbox key={`${workspace.id}:${allWorkspaces}`} id={`mcp-workspace-${workspace.id}`} name="workspace_id" value={workspace.id} disabled={allWorkspaces} /><Label htmlFor={`mcp-workspace-${workspace.id}`}>{workspace.name}</Label></div>)}
      <p className="text-sm text-muted-foreground">Selecting no workspaces grants no workspace data. Your current membership and ownership still limit every action.</p>
    </fieldset>
    <div className="space-y-2"><Label htmlFor="mcp-expiry">Access expires</Label><select id="mcp-expiry" name="expiry" defaultValue="7d" disabled={pending} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="1h">In one hour</option><option value="1d">In one day</option><option value="7d">In seven days</option><option value="30d">In thirty days</option></select></div>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error} <Link href="/connections" className="underline">Connections</Link></p>}
    <div className="flex gap-3"><Button type="submit" name="decision" value="approve" disabled={pending}>{pending ? 'Saving…' : 'Allow access'}</Button><Button type="submit" name="decision" value="deny" variant="outline" disabled={pending}>Deny</Button></div>
  </form>
}
