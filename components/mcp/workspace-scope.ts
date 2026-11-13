export function connectionWorkspaceNames(ids: readonly string[], workspaces: readonly { id: string; name: string }[]): string[] {
  const names = new Map(workspaces.map(workspace => [workspace.id, workspace.name]))
  return ids.map(id => names.get(id) ?? "Unavailable workspace")
}
