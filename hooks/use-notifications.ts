"use client"

import { useCallback, useMemo } from "react"
import { useToast } from "./use-toast"

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface NotificationOptions {
    title: string
    description: string
    type?: NotificationType
    duration?: number
}

export function useNotifications() {
    const { toast } = useToast()

    const notify = useCallback(({ title, description, type = 'info', duration = 5000 }: NotificationOptions) => {
        // Show toast
        toast({
            title,
            description,
            variant: type === 'error' ? 'destructive' : 'default',
            duration
        })

        // Add to notification center
        if (typeof window !== 'undefined' && (window as any).addNotification) {
            (window as any).addNotification({
                title,
                description,
            type
            })
        }
    }, [toast])

    const success = useCallback((title: string, description: string) => {
        notify({ title, description, type: 'success' })
    }, [notify])

    const error = useCallback((title: string, description: string) => {
        notify({ title, description, type: 'error', duration: 8000 })
    }, [notify])

    const info = useCallback((title: string, description: string) => {
        notify({ title, description, type: 'info' })
    }, [notify])

    const warning = useCallback((title: string, description: string) => {
        notify({ title, description, type: 'warning' })
    }, [notify])

    return useMemo(() => ({
        notify,
        success,
        error,
        info,
        warning
    }), [notify, success, error, info, warning])
}
