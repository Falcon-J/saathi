export function groupConnectionPermissions(capabilities: readonly string[]) {
  const groups = new Map<string, string[]>()
  for (const capability of capabilities) {
    const [area, permission] = capability.split(':')
    const group = area === 'agent_runs' ? 'Agent work'
      : permission === 'read' || permission === 'access_read' ? 'Read'
      : ['delete', 'archive'].includes(permission) ? 'Destructive actions'
      : ['members', 'invitations', 'invitation_links', 'workspaces', 'canvas'].includes(area) && !['workspaces:write', 'canvas:reference_create'].includes(capability) ? 'Access and administration' : 'Edit work'
    groups.set(group, [...(groups.get(group) ?? []), capability])
  }
  return [...groups].map(([label, scopes]) => ({ label, scopes }))
}
