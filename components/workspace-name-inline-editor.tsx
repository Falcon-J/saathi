"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Check, X, Edit2 } from "lucide-react"
import { updateWorkspaceName } from "@/app/actions/workspaces"
import { useNotifications } from "@/hooks/use-notifications"

interface WorkspaceNameInlineEditorProps {
    workspaceId: string
    currentName: string
    isOwner: boolean
    onNameUpdated?: () => void
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
    const { success, error } = useNotifications()

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
            error("Workspace name is required", "Enter a name before saving.")
            return
        }

        if (name.trim() === currentName) {
            setIsEditing(false)
            return
        }

        setIsLoading(true)

        try {
            await updateWorkspaceName(workspaceId, name.trim())
            setIsEditing(false)
            success("Workspace renamed", "Your workspace name has been updated.")

            if (onNameUpdated) {
                onNameUpdated()
            }
        } catch (caughtError) {
            console.error("Error updating workspace name:", caughtError)
            error("Unable to rename workspace", caughtError instanceof Error ? caughtError.message : "Please try again.")
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
                        aria-label="Save workspace name"
                    >
                        <Check className="h-3 w-3" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={isLoading}
                        className="h-8 w-8 p-0"
                        aria-label="Cancel workspace rename"
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
                className="h-6 w-6 p-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Rename ${currentName}`}
            >
                <Edit2 className="h-3 w-3" />
            </Button>
        </div>
    )
}
