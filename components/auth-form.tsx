"use client"

import React, { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, LockKeyhole, Mail, UserRound } from "lucide-react"
import { login, signup } from "@/lib/auth-simple"
import { safeAuthRedirect } from "@/lib/supabase/auth-boundary"
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
  const [confirmation, setConfirmation] = useState<string | null>(null)
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
        if (result.confirmationRequired) {
          setConfirmation(result.message || "Check your email to verify your account. Open the link in this browser.")
          return
        }
        window.localStorage.setItem("auth-change", Date.now().toString())
        success(
          isSignup ? "Account created" : "Signed in",
          isSignup ? "Create your first workspace to get started." : "Welcome back to Saathi.",
        )
        const redirect = new URLSearchParams(window.location.search).get("redirect")
        router.replace(safeAuthRedirect(redirect))
        router.refresh()
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
      <header className="bg-transparent">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>
          <p className="text-sm text-muted-foreground">{isSignup ? "Already have an account?" : "Don't have an account?"} <Link className="font-semibold text-foreground hover:text-primary" href={isSignup ? "/login" : "/register"}>{isSignup ? "Sign in" : "Get started"}</Link></p>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-14 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
        <section className="order-1 mx-auto w-full max-w-md">
          <div className="rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 shadow-[0_12px_32px_rgb(29_29_31/0.08)] sm:p-8">
            <div className="mb-7">
            <p className="saathi-label text-primary">{isSignup ? "Create account" : "Welcome back"}</p>
              <h2 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.04em]">{isSignup ? "Create your account" : "Sign in to continue"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isSignup ? "Create your account, then set up a workspace for the work you want to move forward." : "Sign in to return to your workspace."}
              </p>
            </div>

            {confirmation ? <div role="status" className="space-y-4 rounded-lg border p-4"><h3 className="font-semibold">Check your email</h3><p className="text-sm text-muted-foreground">{confirmation} Open the link in this browser.</p><Link href="/login" className="text-primary underline">Return to sign in</Link></div> : <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder={isSignup ? "At least 8 characters" : "Enter your password"}
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
            </form>}

            {!isSignup && <p className="mt-4 text-center text-sm"><Link className="text-primary hover:underline" href="/forgot-password">Forgot password?</Link></p>}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
              <Link href={isSignup ? "/login" : "/register"} className="font-semibold text-primary hover:underline">
                {isSignup ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </section>

        <section className="order-2 hidden min-h-[520px] items-center justify-center lg:flex">
          <div className="relative flex w-full max-w-xl flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_center,#eeecff_0%,#f7f8fc_66%,transparent_72%)] p-10 text-center">
            <Image src="/saathi-auth-illustration.png" alt="A collaborative checklist and paper plane" width={430} height={430} className="relative z-10 w-full max-w-[430px] object-contain" priority />
            <p className="mt-2 font-[cursive] text-2xl text-primary">{isSignup ? "Ideas bring people together." : "Work together. Go further."}</p>
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
