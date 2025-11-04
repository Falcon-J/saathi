"use client"

import { useEffect, useState } from "react"
import { TaskList } from "./components/TaskList"
import { Task, getTasks } from "./actions"
import { useSSE } from "@/hooks/useSSE"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, BarChart3 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [workspaceId] = useState("default-workspace") // For now, use a default workspace

    // Real-time connection via SSE (simplified)
    const { isConnected, error: sseError } = useSSE('/tasks/stream', {
        onMessage: (event) => {
            // Just maintain connection for now
            console.log('SSE message:', event.type)
        },
        onError: (error) => {
            console.error('SSE Error:', error)
        }
    })

    const loadTasks = async () => {
        try {
            setLoading(true)
            const result = await getTasks(workspaceId)
            if (result.error) {
                setError(result.error)
                setTasks([])
            } else {
                setTasks(result.tasks || [])
                setError(null)
            }
        } catch (error) {
            console.error("Failed to load tasks:", error)
            setError("Failed to load tasks")
            setTasks([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadTasks()
    }, [workspaceId])

    const handleTaskUpdate = () => {
        loadTasks()
    }

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 container mx-auto px-4 py-8">
                    <div className="space-y-6">
                        <Skeleton className="h-8 w-48" />
                        <Card>
                            <CardHeader>
                                <Skeleton className="h-6 w-32" />
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-16 w-full" />
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </main>
                <Footer />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <main className="flex-1 container mx-auto px-4 py-8">
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold flex items-center gap-2">
                                <BarChart3 className="w-8 h-8 text-primary" />
                                Tasks
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                Manage your tasks and collaborate with your team
                            </p>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-muted-foreground">
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {sseError && (
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                Real-time updates are currently unavailable. Tasks will still work, but you may need to refresh to see changes from other users.
                            </AlertDescription>
                        </Alert>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Task Management</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TaskList
                                tasks={tasks}
                                workspaceId={workspaceId}
                                onTaskUpdate={handleTaskUpdate}
                            />
                        </CardContent>
                    </Card>
                </div>
            </main>

            <Footer />
        </div>
    )
}