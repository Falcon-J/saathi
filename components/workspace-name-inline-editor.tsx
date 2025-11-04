"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Check, X, Edit2 } from "lucide-react"
import { toast } from "sonner"
import { updateWorkspaceName } from "@/app/actions/workspaces"

interface WorkspaceNameInlineEditorProps {
    workspaceId: string
    currentName: string
    isOwner: boolean
    onNameUpdated?: (newName: string) => void
    className?: string
}

export function WorkspaceNameInlineEditor({
    workspaceId,
    currentName,
    isOwner,
    onNameUpdated,
    className = ""
}: WorkspaceNameInlineEditorProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [name, setName] = useState(currentName)
    const [isLoading, setIsLoading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    useEffect(() => {
        setName(currentName)
    }, [currentName])

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Workspace name cannot be empty")
            return
        }

        if (name.trim() === currentName) {
            setIsEditing(false)
            return
        }

        setIsLoading(true)

        try {
            await updateWorkspaceName(workspaceId, name.trim())
            toast.success("Workspace name updated")
            setIsEditing(false)

            if (onNameUpdated) {
                onNameUpdated(name.trim())
            }
        } catch (error) {
            console.error("Error updating workspace name:", error)
            toast.error(error instanceof Error ? error.message : "Failed to update workspace name")
            setName(currentName) // Reset on error
        } finally {
            setIsLoading(false)
        }
    }

    const handleCancel = () => {
        setName(currentName)
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSave()
        } else if (e.key === "Escape") {
            handleCancel()
        }
    }

    if (!isOwner) {
        return (
            <span className={`font-medium ${className}`}>
                {currentName}
            </span>
        )
    }

    if (isEditing) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <Input
                    ref={inputRef}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    disabled={isLoading}
                    className="h-8 text-sm font-medium"
                    maxLength={100}
                />
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={isLoading || !name.trim()}
                        className="h-8 w-8 p-0"
                    >
                        <Check className="h-3 w-3" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isLoading}
                        className="h-8 w-8 p-0"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className={`flex items-center gap-2 group ${className}`}>
            <span className="font-medium">{currentName}</span>
            <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsEditing(true)}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Edit2 className="h-3 w-3" />
            </Button>
        </div>
    )
}