"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Edit2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { updateWorkspaceName } from "@/app/actions/workspaces"

interface WorkspaceNameEditorProps {
    workspaceId: string
    currentName: string
    isOwner: boolean
    onNameUpdated?: (newName: string) => void
}

export function WorkspaceNameEditor({
    workspaceId,
    currentName,
    isOwner,
    onNameUpdated
}: WorkspaceNameEditorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState(currentName)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            toast.error("Workspace name cannot be empty")
            return
        }

        if (name.trim() === currentName) {
            setIsOpen(false)
            return
        }

        setIsLoading(true)

        try {
            await updateWorkspaceName(workspaceId, name.trim())
            toast.success("Workspace name updated successfully")
            setIsOpen(false)

            if (onNameUpdated) {
                onNameUpdated(name.trim())
            }
        } catch (error) {
            console.error("Error updating workspace name:", error)
            toast.error(error instanceof Error ? error.message : "Failed to update workspace name")
        } finally {
            setIsLoading(false)
        }
    }

    const handleCancel = () => {
        setName(currentName)
        setIsOpen(false)
    }

    if (!isOwner) {
        return null
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 hover:bg-muted"
                    title="Edit workspace name"
                >
                    <Edit2 className="h-3 w-3" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Workspace Name</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="workspace-name">Workspace Name</Label>
                        <Input
                            id="workspace-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter workspace name"
                            maxLength={100}
                            disabled={isLoading}
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground">
                            {name.length}/100 characters
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancel}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || !name.trim()}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}