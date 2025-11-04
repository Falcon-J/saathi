"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getSession, logout } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
    BarChart3,
    LogOut,
    Settings,
    User
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function Header() {
    const [user, setUser] = useState<{ email: string; username: string } | null>(null)
    const router = useRouter()
    const { toast } = useToast()

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const session = await getSession()
                setUser(session)
            } catch (error) {
                console.error("Header auth check failed:", error)
            }
        }
        checkAuth()
    }, [])

    const handleLogout = async () => {
        try {
            await logout()
            toast({
                title: "Logged out",
                description: "You have been successfully logged out"
            })
            router.push("/login")
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to log out",
                variant: "destructive"
            })
        }
    }

    return (
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-xl">Saathi</span>
                </Link>

                <nav className="hidden md:flex items-center gap-6">
                    <Link
                        href="/tasks"
                        className="text-sm font-medium hover:text-primary transition-colors"
                    >
                        Tasks
                    </Link>
                    <Link
                        href="/dashboard"
                        className="text-sm font-medium hover:text-primary transition-colors"
                    >
                        Dashboard
                    </Link>
                </nav>

                <div className="flex items-center gap-4">
                    {user ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback>
                                            {user.username.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <div className="flex items-center justify-start gap-2 p-2">
                                    <div className="flex flex-col space-y-1 leading-none">
                                        <p className="font-medium">{user.username}</p>
                                        <p className="w-[200px] truncate text-sm text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    <User className="mr-2 h-4 w-4" />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Settings className="mr-2 h-4 w-4" />
                                    <span>Settings</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" asChild>
                                <Link href="/login">Login</Link>
                            </Button>
                            <Button asChild>
                                <Link href="/register">Sign Up</Link>
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}