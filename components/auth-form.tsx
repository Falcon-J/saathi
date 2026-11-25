"use client"

import React, { useEffect, useRef, useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { login, signup } from "@/lib/auth-simple"
import { safeAuthRedirect } from "@/lib/supabase/auth-boundary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useNotifications } from "@/hooks/use-notifications"

interface AuthFormProps {
  mode: "login" | "signup"
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const { success } = useNotifications()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const [returnTo, setReturnTo] = useState("/canvas")
  const [hydrated, setHydrated] = useState(false)
  const pendingRequest = useRef(false)
  const isSignup = mode === "signup"
  const signInHref = `/login?redirect=${encodeURIComponent(returnTo)}`
  const registerHref = `/register?redirect=${encodeURIComponent(returnTo)}`

  useEffect(() => {
    setHydrated(true)
    setReturnTo(safeAuthRedirect(new URLSearchParams(window.location.search).get("redirect")))
    if (!isSignup) setPasswordResetComplete(new URLSearchParams(window.location.search).get("reset") === "success")
  }, [isSignup])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!hydrated || pendingRequest.current) return
    setFormError(null)

    if (!email.trim() || !password.trim()) {
      setFormError("Email and password are required.")
      return
    }

    if (isSignup && !username.trim()) {
      setFormError("Add your name so teammates can identify you.")
      return
    }

    pendingRequest.current = true
    setLoading(true)

    try {
      const redirect = new URLSearchParams(window.location.search).get("redirect")
      const result = isSignup ? await signup(email, username, password, redirect) : await login(email, password)

      if (result.error) {
        setFormError(result.error)
        return
      }

      if (result.success) {
        if (result.confirmationRequired) {
          setConfirmation(result.message || "Check your email to verify your account.")
          return
        }
        try { window.localStorage.setItem("auth-change", Date.now().toString()) } catch { /* Cross-tab notification is optional after a committed login. */ }
        success(
          isSignup ? "Account created" : "Signed in",
          isSignup ? "Create your first workspace to get started." : "Welcome back to Saathi.",
        )
        router.replace(safeAuthRedirect(redirect))
        router.refresh()
      }
    } catch (error) {
      console.error("Auth form error:", error)
      setFormError("Something went wrong. Please try again.")
    } finally {
      pendingRequest.current = false
      setLoading(false)
    }
  }

  return (
    <AuthShell eyebrow={isSignup ? "Get started" : "Welcome back"} title={isSignup ? "Create an account" : "Sign in"} description={isSignup ? "One task graph for you and your agents." : "Pick up where your team and agents left off."}>
              {passwordResetComplete && !confirmation && <div role="status" className="mt-5 rounded-xl border border-primary/30 bg-accent p-4 text-sm leading-5 text-accent-foreground"><p className="font-semibold text-foreground">Password updated</p><p className="mt-1">Sign in with your new password.</p></div>}

              {confirmation ? (
                <div role="status" className="mt-8 space-y-4 rounded-xl border border-border bg-secondary p-5">
                  <h2 className="font-semibold text-foreground">Check your email</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{confirmation}</p>
                  <Link href={signInHref} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Return to sign in</Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} aria-busy={!hydrated || loading} className="mt-8 space-y-4">
                  {isSignup && (
                    <FieldShell label="Name" id="account-name">
                      <Input id="account-name" type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" autoComplete="name" disabled={!hydrated || loading} required className="h-11" />
                    </FieldShell>
                  )}

                  <FieldShell label="Email" id="account-email">
                    <Input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" disabled={!hydrated || loading} required className="h-11" />
                  </FieldShell>

                  <FieldShell label="Password" id="account-password">
                    <div className="relative">
                      <Input id="account-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Create a password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} disabled={!hydrated || loading} required className="h-11 pr-12" />
                      <button type="button" disabled={!hydrated || loading} className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="size-4 lg:size-5" aria-hidden="true" /> : <Eye className="size-4 lg:size-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </FieldShell>

                  {!isSignup && (
                    <div className="-mt-1 flex justify-end text-sm">
                      <Link className="font-semibold text-primary hover:underline" href="/forgot-password">Forgot password?</Link>
                    </div>
                  )}

                  {formError && <p role="alert" className="rounded-md border border-destructive/30 bg-[var(--saathi-danger-soft)] px-3 py-2.5 text-sm leading-5 text-destructive">{formError}</p>}

                  <Button type="submit" size="lg" className="w-full" disabled={!hydrated || loading} loading={loading}>
                    {loading ? (isSignup ? "Creating account" : "Signing in") : isSignup ? "Create account" : "Sign in"}
                  </Button>
                </form>
              )}

              <p className="mt-6 text-sm text-muted-foreground">
                {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
                <Link href={isSignup ? signInHref : registerHref} className="font-semibold text-primary hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
              </p>
    </AuthShell>
  )
}

function FieldShell({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 sm:space-y-1">
      <label htmlFor={id} className="block text-base font-medium text-foreground sm:text-sm">{label}</label>
      {children}
    </div>
  )
}
