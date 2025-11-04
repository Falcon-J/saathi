"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, Check, X, Users, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
    getUserInvitations,
    acceptInvitation,
    declineInvitation,
    type Invitation
} from "@/app/actions/invitations"

interface InvitationNotificationsProps {
    userEmail: string
    onInvitationAccepted?: () => void
}

export function InvitationNotifications({ userEmail, onInvitationAccepted }: InvitationNotificationsProps) {
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<string | null>(null)
    const { toast } = useToast()

    const loadInvitations = async () => {
        try {
            const userInvitations = await getUserInvitations(userEmail)
            setInvitations(userInvitations.filter(inv => inv.status === "pending"))
        } catch (error) {
            console.error("[Saathi] Failed to load invitations:", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (userEmail) {
            loadInvitations()

            // Poll for new invitations every 10 seconds
            const interval = setInterval(loadInvitations, 10000)
            return () => clearInterval(interval)
        }
    }, [userEmail])

    const handleAcceptInvitation = async (invitation: Invitation) => {
        setProcessingId(invitation.id)
        try {
            await acceptInvitation(invitation.id)
            toast({
                title: "Invitation accepted",
                description: `You've joined ${invitation.workspaceName}`,
            })

            // Remove from local state
            setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))

            // Notify parent component to refresh workspaces
            onInvitationAccepted?.()
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to accept invitation",
                variant: "destructive",
            })
        } finally {
            setProcessingId(null)
        }
    }

    const handleDeclineInvitation = async (invitation: Invitation) => {
        setProcessingId(invitation.id)
        try {
            await declineInvitation(invitation.id)
            toast({
                title: "Invitation declined",
                description: `You declined to join ${invitation.workspaceName}`,
            })

            // Remove from local state
            setInvitations(prev => prev.filter(inv => inv.id !== invitation.id))
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to decline invitation",
                variant: "destructive",
            })
        } finally {
            setProcessingId(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bell className="w-4 h-4" />
                <span>Loading invitations...</span>
            </div>
        )
    }

    if (invitations.length === 0) {
        return null
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h3 className="font-medium text-foreground">
                    Workspace Invitations ({invitations.length})
                </h3>
            </div>

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
                                    disabled={processingId === invitation.id}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    <Check className="w-4 h-4 mr-1" />
                                    Accept
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeclineInvitation(invitation)}
                                    disabled={processingId === invitation.id}
                                    className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                    <X className="w-4 h-4 mr-1" />
                                    Decline
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}