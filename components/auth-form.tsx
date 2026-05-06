"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, LockKeyhole, Mail, Radio, UserRound } from "lucide-react"
import { login, signup } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { SaathiLogo } from "@/components/saathi-logo"

interface AuthFormProps {
  mode: "login" | "signup"
}

const workspaceSignals = [
  "SSE task updates",
  "Workspace member controls",
  "Invite notifications",
]

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const isSignup = mode === "signup"

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!email.trim() || !password.trim()) {
      toast({
        title: "Missing credentials",
        description: "Email and password are required.",
        variant: "destructive",
      })
      return
    }

    if (isSignup) {
      if (!username.trim()) {
        toast({
          title: "Username required",
          description: "Add a username so teammates can identify you.",
          variant: "destructive",
        })
        return
      }

      if (password !== confirmPassword) {
        toast({
          title: "Passwords do not match",
          description: "Confirm your password before creating the account.",
          variant: "destructive",
        })
        return
      }
    }

    setLoading(true)

    try {
      const result = isSignup ? await signup(email, username, password) : await login(email, password)

      if (result.error) {
        toast({
          title: "Authentication failed",
          description: result.error,
          variant: "destructive",
        })
        return
      }

      if (result.success) {
        toast({
          title: isSignup ? "Account created" : "Signed in",
          description: isSignup ? "Your Saathi workspace access is ready." : "Welcome back to Saathi.",
        })

        setTimeout(() => {
          router.replace("/dashboard")
        }, 300)
      }
    } catch (error) {
      console.error("Auth form error:", error)
      toast({
        title: "Authentication failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="saathi-shell relative min-h-screen overflow-hidden">
      <div className="saathi-grid absolute inset-0 opacity-20" />
      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <section className="hidden lg:block">
          <Link href="/" className="mb-12 flex w-fit items-center gap-3">
            <SaathiLogo className="size-10" priority />
            <div>
              <p className="text-xl font-bold">Saathi</p>
              <p className="saathi-label text-muted-foreground">Realtime workspace</p>
            </div>
          </Link>

          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm text-primary">
              <Radio className="size-4 animate-pulse" />
              Workspace gateway
            </div>
            <h1 className="text-5xl font-bold leading-tight">
              {isSignup ? "Create your team command center." : "Return to your live workspace."}
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Saathi keeps tasks, members, invites, and realtime state in one focused operating surface for collaborative delivery.
            </p>
          </div>

          <div className="mt-10 grid max-w-xl gap-3">
            {workspaceSignals.map((signal) => (
              <div key={signal} className="saathi-panel-soft flex items-center gap-3 rounded-lg p-4">
                <CheckCircle2 className="size-5 text-primary" />
                <span className="font-medium">{signal}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="saathi-panel rounded-xl p-5 sm:p-7">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="saathi-label text-primary">{isSignup ? "New account" : "Secure sign in"}</p>
                <h2 className="mt-2 text-3xl font-semibold">{isSignup ? "Join Saathi" : "Welcome back"}</h2>
              </div>
              <SaathiLogo className="size-12" priority />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldShell label="Email" icon={<Mail className="size-4" />}>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  disabled={loading}
                  required
                  className="border-border bg-input font-mono text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                />
              </FieldShell>

              {isSignup && (
                <FieldShell label="Username" icon={<UserRound className="size-4" />}>
                  <Input
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Asha Sharma"
                    disabled={loading}
                    required
                    className="border-border bg-input font-mono text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                  />
                </FieldShell>
              )}

              <FieldShell label="Password" icon={<LockKeyhole className="size-4" />}>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? "At least 6 characters" : "Enter your password"}
                  disabled={loading}
                  required
                  className="border-border bg-input font-mono text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                />
              </FieldShell>

              {isSignup && (
                <FieldShell label="Confirm password" icon={<LockKeyhole className="size-4" />}>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your password"
                    disabled={loading}
                    required
                    className="border-border bg-input font-mono text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/40"
                  />
                </FieldShell>
              )}

              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {isSignup ? "Creating account" : "Signing in"}
                  </>
                ) : isSignup ? (
                  "Create account"
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-border/70 bg-background/50 p-4 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account?" : "Need a workspace account?"}{" "}
              <Link href={isSignup ? "/login" : "/register"} className="font-semibold text-primary hover:underline">
                {isSignup ? "Sign in" : "Create one"}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function FieldShell({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </label>
  )
}
