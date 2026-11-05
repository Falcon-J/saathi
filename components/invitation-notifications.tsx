"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, Check, X, Users, Clock, RefreshCw } from "lucide-react"
import { useNotifications } from "@/hooks/use-notifications"
import {
    getUserInvitations,
    acceptInvitation,
    declineInvitation,
    type Invitation
} from "@/app/actions/invitations"

interface InvitationNotificationsProps {
    userEmail: string
    onInvitationAccepted?: (workspaceId: string) => void | Promise<void>
}

export function InvitationNotifications({ userEmail, onInvitationAccepted }: InvitationNotificationsProps) {
    const [inlineError, setInlineError] = useState<string | null>(null)
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const loadSequence = useRef(0)
    const accountRef = useRef({ email: userEmail, active: false })
    const { success, error } = useNotifications()

    useLayoutEffect(() => {
        const account = { email: userEmail, active: true }
        accountRef.current = account
        setInvitations([])
        setLoading(Boolean(userEmail))
        setProcessingId(null)
        setInlineError(null)
        return () => { account.active = false }
    }, [userEmail])

    const loadInvitations = useCallback(async () => {
        const account = accountRef.current
        const isCurrent = () => account.active && accountRef.current === account && account.email === userEmail
        if (!isCurrent()) return
        const sequence = ++loadSequence.current
        setLoading(true)
        try {
            const userInvitations = await getUserInvitations(userEmail)
            if (!isCurrent() || sequence !== loadSequence.current) return
            setInvitations(userInvitations.filter(inv => inv.status === "pending"))
            setInlineError(null)
        } catch (error) {
            if (!isCurrent() || sequence !== loadSequence.current) return
            setInlineError(error instanceof Error ? error.message : "Unable to load invitations.")
        } finally {
            if (isCurrent() && sequence === loadSequence.current) setLoading(false)
        }
    }, [userEmail])

    useEffect(() => {
        if (!userEmail) return
        void loadInvitations()
        const sequenceRef = loadSequence
        const refresh = () => { void loadInvitations() }
        window.addEventListener("focus", refresh)
        return () => {
            sequenceRef.current++
            window.removeEventListener("focus", refresh)
        }
    }, [userEmail, loadInvitations])

    const handleAcceptInvitation = async (invitation: Invitation) => {
        const account = accountRef.current
        const isCurrent = () => account.active && accountRef.current === account && account.email === userEmail
        if (!isCurrent()) return
        setProcessingId(invitation.id)
        try {
            const result = await acceptInvitation(invitation.id)
            if (!isCurrent()) return
            if (result.error) throw new Error(result.error)
            loadSequence.current++
            setLoading(false)
            setInlineError(null)
            success("Invitation accepted", `You've joined ${invitation.workspaceName}`)

            // Remove from local state
            setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))

            // Notify parent component to refresh workspaces
            try {
                await onInvitationAccepted?.(invitation.workspaceId)
            } catch {
                if (isCurrent()) setInlineError("Invitation accepted. Refresh your workspaces to open it.")
            }
        } catch (caughtError: unknown) {
            if (!isCurrent()) return
            setInlineError(caughtError instanceof Error ? caughtError.message : "Unable to update invitation.")
            error("Unable to accept invitation", caughtError instanceof Error ? caughtError.message : "Failed to accept invitation")
        } finally {
            if (isCurrent()) setProcessingId(null)
        }
    }

    const handleDeclineInvitation = async (invitation: Invitation) => {
        const account = accountRef.current
        const isCurrent = () => account.active && accountRef.current === account && account.email === userEmail
        if (!isCurrent()) return
        setProcessingId(invitation.id)
        try {
            const result = await declineInvitation(invitation.id)
            if (!isCurrent()) return
            if (result.error) throw new Error(result.error)
            loadSequence.current++
            setLoading(false)
            setInlineError(null)
            success("Invitation declined", `You declined to join ${invitation.workspaceName}`)

            // Remove from local state
            setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
        } catch (caughtError: unknown) {
            if (!isCurrent()) return
            setInlineError(caughtError instanceof Error ? caughtError.message : "Unable to update invitation.")
            error("Unable to decline invitation", caughtError instanceof Error ? caughtError.message : "Failed to decline invitation")
        } finally {
            if (isCurrent()) setProcessingId(null)
        }
    }

    return (
        <section aria-label="Workspace invitations" aria-busy={loading} className={!loading && !inlineError && invitations.length === 0 ? "mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1" : "mb-4 space-y-3"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-medium text-foreground">Invitations{invitations.length > 0 ? ` (${invitations.length})` : ""}</h2>
                </div>
                <Button variant="ghost" size="sm" disabled={loading || Boolean(processingId)} onClick={() => void loadInvitations()}><RefreshCw className="size-3.5" />Refresh invitations</Button>
            </div>
            {inlineError && <div role="alert" className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">{inlineError}</div>}
            {loading && <p role="status" className={invitations.length ? "sr-only" : "text-xs text-muted-foreground"}>Loading invitations...</p>}
            {!loading && !inlineError && invitations.length === 0 && <p className="text-xs text-muted-foreground">No pending invitations.</p>}

            <div className="space-y-3">
                {invitations.map((invitation) => (
                    <Card key={invitation.id} className="p-4 bg-card border-border">
                        <div className="space-y-3">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4 text-muted-foreground" />
                                        <span className="font-medium text-foreground">
                                            {invitation.workspaceName}
                                        </span>
                                        <Badge variant="secondary" className="text-xs">
                                            Pending
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        <strong>{invitation.inviterUsername}</strong> invited you to join this workspace
                                    </p>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        <span>
                                            Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => handleAcceptInvitation(invitation)}
                                    disabled={Boolean(processingId)}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                                >
                                    <Check className="w-4 h-4 mr-1" />
                                    Accept
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeclineInvitation(invitation)}
                                    disabled={Boolean(processingId)}
                                >
                                    <X className="w-4 h-4 mr-1" />
                                    Decline
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    )
}
