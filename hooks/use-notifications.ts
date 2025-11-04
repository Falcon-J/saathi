"use client"

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

    const notify = ({ title, description, type = 'info', duration = 5000 }: NotificationOptions) => {
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
    }

    const success = (title: string, description: string) => {
        notify({ title, description, type: 'success' })
    }

    const error = (title: string, description: string) => {
        notify({ title, description, type: 'error', duration: 8000 })
    }

    const info = (title: string, description: string) => {
        notify({ title, description, type: 'info' })
    }

    const warning = (title: string, description: string) => {
        notify({ title, description, type: 'warning' })
    }

    return {
        notify,
        success,
        error,
        info,
        warning
    }
}