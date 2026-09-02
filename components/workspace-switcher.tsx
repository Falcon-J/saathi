"use client"

import { Plus } from "lucide-react"
import type { Workspace } from "@/app/actions/workspaces"
import { Button } from "@/components/ui/button"

type WorkspaceSwitcherProps = {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  onSelectWorkspace: (id: string) => void
  onStartNew: () => void
}

export function WorkspaceSwitcher({ workspaces, currentWorkspaceId, onSelectWorkspace, onStartNew }: WorkspaceSwitcherProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="workspace-select">Current workspace</label>
      <select
        id="workspace-select"
        value={currentWorkspaceId ?? ""}
        onChange={(event) => onSelectWorkspace(event.target.value)}
        className="h-10 min-w-0 flex-1 rounded-[var(--saathi-radius-control)] border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-sm"
      >
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
      <Button type="button" variant="outline" onClick={onStartNew} className="justify-center">
        <Plus className="size-4" />
        Start something new
      </Button>
    </div>
  )
}
