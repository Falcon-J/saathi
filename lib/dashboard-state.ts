export function getDashboardState(input: {
  authenticated: boolean
  loading: boolean
  error: string | null
  workspaceCount: number
  creating: boolean
}) {
  if (!input.authenticated) return 'auth-loading'
  if (input.loading) return 'workspace-loading'
  if (input.error) return 'workspace-error'
  if (input.creating) return 'creating'
  return input.workspaceCount === 0 ? 'empty' : 'workspace'
}
