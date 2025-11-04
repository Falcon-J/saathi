"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bell, Check, X, AlertCircle, Info, CheckCircle } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Notification {
    id: string
    title: string
    description: string
    type: 'success' | 'error' | 'info' | 'warning'
    timestamp: Date
    read: boolean
}

export function NotificationCenter() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [isOpen, setIsOpen] = useState(false)

    // Add notification function that can be called from anywhere
    const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        const newNotification: Notification = {
            ...notification,
            id: Date.now().toString(),
            timestamp: new Date(),
            read: false
        }

        setNotifications(prev => [newNotification, ...prev.slice(0, 49)]) // Keep last 50

        // Log for debugging
        console.log(`[Notification] ${notification.type}: ${notification.title}`)

        // Auto-remove after 10 seconds for success notifications
        if (notification.type === 'success') {
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== newNotification.id))
            }, 10000)
        }
    }

    // Expose addNotification globally
    useEffect(() => {
        (window as any).addNotification = addNotification
    }, [])

    const unreadCount = notifications.filter(n => !n.read).length

    const markAsRead = (id: string) => {
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
    }

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }

    const removeNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />
            case 'error': return <AlertCircle className="w-4 h-4 text-red-600" />
            case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-600" />
            case 'info': return <Info className="w-4 h-4 text-blue-600" />
        }
    }

    const getTypeColor = (type: Notification['type']) => {
        switch (type) {
            case 'success': return 'bg-green-500/10 border-green-200'
            case 'error': return 'bg-red-500/10 border-red-200'
            case 'warning': return 'bg-yellow-500/10 border-yellow-200'
            case 'info': return 'bg-blue-500/10 border-blue-200'
        }
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="relative">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                        <Badge
                            variant="destructive"
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b border-border/50 pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Bell className="w-5 h-5" />
                                Notifications
                            </CardTitle>
                            {unreadCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={markAllAsRead}
                                    className="text-xs"
                                >
                                    Mark all read
                                </Button>
                            )}
                        </div>
                        <CardDescription>
                            {notifications.length === 0
                                ? "No notifications yet"
                                : `${notifications.length} notification${notifications.length !== 1 ? 's' : ''}`
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-muted-foreground">
                                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No notifications yet</p>
                                <p className="text-xs">Activity will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`p-3 border-l-4 ${getTypeColor(notification.type)} ${!notification.read ? 'bg-muted/30' : ''
                                            } hover:bg-muted/50 transition-colors`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {getIcon(notification.type)}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-medium text-foreground truncate">
                                                        {notification.title}
                                                    </p>
                                                    <div className="flex items-center gap-1 ml-2">
                                                        {!notification.read && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => markAsRead(notification.id)}
                                                                className="h-6 w-6 p-0"
                                                                title="Mark as read"
                                                            >
                                                                <Check className="w-3 h-3" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removeNotification(notification.id)}
                                                            className="h-6 w-6 p-0"
                                                            title="Remove"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {notification.description}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {notification.timestamp.toLocaleTimeString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </PopoverContent>
        </Popover>
    )
}