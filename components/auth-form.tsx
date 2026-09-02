"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react"
import { login, signup } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useNotifications } from "@/hooks/use-notifications"
import { SaathiLogo } from "@/components/saathi-logo"

interface AuthFormProps {
  mode: "login" | "signup"
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const { success } = useNotifications()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isSignup = mode === "signup"

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!email.trim() || !password.trim()) {
      setFormError("Email and password are required.")
      return
    }

    if (isSignup && !username.trim()) {
      setFormError("Add a username so teammates can identify you.")
      return
    }

    if (isSignup && password !== confirmPassword) {
      setFormError("Passwords do not match. Confirm your password before creating the account.")
      return
    }

    setLoading(true)

    try {
      const result = isSignup ? await signup(email, username, password) : await login(email, password)

      if (result.error) {
        setFormError(result.error)
        return
      }

      if (result.success) {
        window.localStorage.setItem("auth-change", Date.now().toString())
        success(
          isSignup ? "Account created" : "Signed in",
          isSignup ? "Your Saathi workspace access is ready." : "Welcome back to Saathi.",
        )
        setTimeout(() => router.replace("/dashboard"), 300)
      }
    } catch (error) {
      console.error("Auth form error:", error)
      setFormError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="saathi-shell min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.72fr)] lg:px-8">
        <section className="order-2 hidden rounded-[var(--saathi-radius-container)] border border-border bg-card p-7 lg:order-1 lg:block">
          <p className="saathi-label text-[var(--saathi-success)]">A calm place to work</p>
          <h1 className="mt-4 max-w-md text-4xl font-semibold tracking-[-0.035em]">Collaborate with clarity.</h1>
          <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
            Keep the work, the people, and the next decision in one focused workspace.
          </p>
          <BoardPreview />
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-[var(--saathi-success)]" />
            Built for teams that value calm, clear delivery.
          </p>
        </section>

        <section className="order-1 mx-auto w-full max-w-md lg:order-2">
          <div className="rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 shadow-[0_12px_32px_rgb(29_29_31/0.08)] sm:p-8">
            <div className="mb-7">
              <p className="saathi-label text-[var(--saathi-success)]">{isSignup ? "New workspace" : "Secure sign in"}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{isSignup ? "Create your workspace" : "Welcome back"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isSignup ? "Start with your team and the work you want to move forward." : "Sign in to return to your workspace."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldShell label="Email" icon={<Mail className="size-4" />}>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  disabled={loading}
                  required
                />
              </FieldShell>

              {isSignup && (
                <FieldShell label="Username" icon={<UserRound className="size-4" />}>
                  <Input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Asha Sharma" disabled={loading} required />
                </FieldShell>
              )}

              <FieldShell label="Password" icon={<LockKeyhole className="size-4" />}>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isSignup ? "At least 6 characters" : "Enter your password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  disabled={loading}
                  required
                />
              </FieldShell>

              {isSignup && (
                <FieldShell label="Confirm password" icon={<LockKeyhole className="size-4" />}>
                  <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" disabled={loading} required />
                </FieldShell>
              )}

              {formError && (
                <p role="alert" className="rounded-[var(--saathi-radius-control)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading ? <><Loader2 className="size-4 animate-spin" />{isSignup ? "Creating account" : "Signing in"}</> : isSignup ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
              <Link href={isSignup ? "/login" : "/register"} className="font-semibold text-primary hover:underline">
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}

function FieldShell({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">{icon}{label}</span>
      {children}
    </label>
  )
}

function BoardPreview() {
  return (
    <div className="mt-8 grid grid-cols-3 gap-2 rounded-[var(--saathi-radius-card)] border border-border bg-background p-3">
      {[
        ["To do", "border-t-primary"],
        ["In progress", "border-t-[var(--saathi-warning)]"],
        ["Done", "border-t-[var(--saathi-success)]"],
      ].map(([label, tone]) => (
        <div key={label} className={`min-w-0 border-t-2 ${tone} pt-2`}>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-2 h-11 rounded-[var(--saathi-radius-control)] border border-border bg-card" />
          <div className="mt-2 h-8 rounded-[var(--saathi-radius-control)] border border-border bg-card" />
        </div>
      ))}
    </div>
  )
}
