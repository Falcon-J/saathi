"use client"

import { useMemo } from 'react'

interface Task {
    id: string
    createdBy: string
    assigneeEmail?: string
    workspaceId: string
}

interface Workspace {
    id: string
    ownerId: string
}

interface UsePermissionsProps {
    currentUserEmail: string
    workspace?: Workspace
    task?: Task
}

export function usePermissions({ currentUserEmail, workspace, task }: UsePermissionsProps) {
    return useMemo(() => {
        const isWorkspaceOwner = workspace ? workspace.ownerId === currentUserEmail : false
        const isTaskCreator = task ? task.createdBy === currentUserEmail : false
        const isTaskAssignee = task ? task.assigneeEmail === currentUserEmail : false

        return {
            // Workspace permissions
            workspace: {
                canEdit: isWorkspaceOwner,
                canDelete: isWorkspaceOwner,
                canInviteMembers: isWorkspaceOwner,
                canRemoveMembers: isWorkspaceOwner,
            },

            // Task permissions
            task: {
                canCreate: true, // All workspace members can create tasks
                canEdit: isWorkspaceOwner || isTaskCreator,
                canDelete: isWorkspaceOwner || isTaskCreator,
                canToggle: isWorkspaceOwner || isTaskCreator || isTaskAssignee,
                canAssign: isWorkspaceOwner || isTaskCreator,
            },

            // Helper flags
            isWorkspaceOwner,
            isTaskCreator,
            isTaskAssignee,
        }
    }, [currentUserEmail, workspace, task, isWorkspaceOwner, isTaskCreator, isTaskAssignee])
}

// Convenience hook for workspace-only permissions
export function useWorkspacePermissions(currentUserEmail: string, workspace?: Workspace) {
    return usePermissions({ currentUserEmail, workspace }).workspace
}

// Convenience hook for task-only permissions
export function useTaskPermissions(currentUserEmail: string, workspace?: Workspace, task?: Task) {
    return usePermissions({ currentUserEmail, workspace, task }).task
}