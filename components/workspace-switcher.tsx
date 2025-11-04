"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ChevronDown, Plus } from "lucide-react"
import { WorkspaceNameEditor } from "@/components/workspace-name-editor"
import type { Workspace } from "@/app/actions/workspaces"

interface WorkspaceSwitcherProps {
  workspaces: Workspace[]
  currentWorkspaceId: string | null
  onSelectWorkspace: (id: string) => void
  onCreateWorkspace: (name: string) => void
  currentUserEmail?: string
  onWorkspaceUpdated?: () => void
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  currentUserEmail,
  onWorkspaceUpdated,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)

  const handleCreate = async () => {
    if (newName.trim()) {
      setIsCreating(true)
      try {
        await onCreateWorkspace(newName)
        setNewName("")
        setIsOpen(false)
      } finally {
        setIsCreating(false)
      }
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant="outline"
          className="flex-1 justify-between bg-card border-border hover:bg-card/80"
        >
          <span className="text-foreground">{currentWorkspace?.name || "Select workspace"}</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>

        {currentWorkspace && currentUserEmail && (
          <WorkspaceNameEditor
            workspaceId={currentWorkspace.id}
            currentName={currentWorkspace.name}
            isOwner={currentWorkspace.ownerId === currentUserEmail}
            onNameUpdated={onWorkspaceUpdated}
          />
        )}
      </div>

      {isOpen && (
        <Card className="absolute top-full mt-2 w-full bg-card border-2 border-border shadow-lg z-50 p-4 space-y-3">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => {
                onSelectWorkspace(workspace.id)
                setIsOpen(false)
              }}
              className={`w-full text-left px-4 py-3 rounded-md text-sm font-medium transition-all duration-200 border ${workspace.id === currentWorkspaceId
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "hover:bg-secondary text-foreground border-transparent hover:border-border hover:shadow-sm"
                }`}
            >
              {workspace.name}
            </button>
          ))}

          <div className="border-t-2 border-border pt-4 mt-4">
            <div className="flex gap-3">
              <Input
                placeholder="New workspace..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
                disabled={isCreating}
                className="bg-input border-2 border-border text-foreground placeholder:text-muted-foreground text-sm focus:border-primary"
              />
              <Button
                onClick={handleCreate}
                disabled={isCreating || !newName.trim()}
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
