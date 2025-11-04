"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { login, signup } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { BarChart3, Loader2 } from "lucide-react"

interface AuthFormProps {
    mode: 'login' | 'signup'
}

export function AuthForm({ mode }: AuthFormProps) {
    const router = useRouter()
    const { toast } = useToast()

    const [email, setEmail] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)

    const isSignup = mode === 'signup'

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email.trim() || !password.trim()) {
            toast({
                title: "Error",
                description: "Please fill in all required fields",
                variant: "destructive"
            })
            return
        }

        if (isSignup) {
            if (!username.trim()) {
                toast({
                    title: "Error",
                    description: "Username is required",
                    variant: "destructive"
                })
                return
            }

            if (password !== confirmPassword) {
                toast({
                    title: "Error",
                    description: "Passwords do not match",
                    variant: "destructive"
                })
                return
            }
        }

        setLoading(true)

        try {
            const result = isSignup
                ? await signup(email, username, password)
                : await login(email, password)

            if (result.error) {
                toast({
                    title: "Error",
                    description: result.error,
                    variant: "destructive"
                })
            } else if (result.success) {
                console.log("Login successful, redirecting to tasks...")
                toast({
                    title: "Success",
                    description: isSignup ? "Account created successfully!" : "Welcome back!"
                })
                // Small delay to ensure toast shows, then redirect
                setTimeout(() => {
                    window.location.href = "/dashboard"
                }, 500)
            }
        } catch (error) {
            console.error("Auth form error:", error)
            toast({
                title: "Error",
                description: "Something went wrong. Please try again.",
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 px-4">
            <Card className="w-full max-w-md border-2 border-border/50 shadow-lg">
                <CardHeader className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-lg">
                            <BarChart3 className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                                Saathi
                            </CardTitle>
                        </div>
                    </div>
                    <CardDescription className="text-base">
                        {isSignup ? "Create your account to get started" : "Welcome back! Please sign in to continue"}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Email</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                disabled={loading}
                                required
                                className="border-2 border-border focus:border-primary"
                            />
                        </div>

                        {isSignup && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Username</label>
                                <Input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Choose a username"
                                    disabled={loading}
                                    required
                                    className="border-2 border-border focus:border-primary"
                                />
                                <p className="text-xs text-muted-foreground">
                                    2-50 characters, letters, numbers, spaces, hyphens, or underscores
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                disabled={loading}
                                required
                                className="border-2 border-border focus:border-primary"
                            />
                            {isSignup && (
                                <p className="text-xs text-muted-foreground">
                                    At least 6 characters
                                </p>
                            )}
                        </div>

                        {isSignup && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground">Confirm Password</label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password"
                                    disabled={loading}
                                    required
                                    className="border-2 border-border focus:border-primary"
                                />
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg font-semibold"
                            disabled={loading}
                            size="lg"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    {isSignup ? "Creating account..." : "Signing in..."}
                                </>
                            ) : (
                                isSignup ? "Create Account" : "Sign In"
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-muted-foreground">
                            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
                            <Link
                                href={isSignup ? "/login" : "/register"}
                                className="text-primary hover:underline font-medium"
                            >
                                {isSignup ? "Sign in" : "Sign up"}
                            </Link>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}