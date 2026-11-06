"use client"

import React, { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react"
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
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const [returnTo, setReturnTo] = useState("/dashboard")
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
    <main className="relative isolate min-h-[100svh] overflow-x-hidden bg-[#faf9f5] text-[#122039]">
      <Image
        src="/saathi-auth-background-v2.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="z-0 hidden object-cover object-center sm:block"
      />
      <div className="absolute inset-y-0 left-0 z-0 hidden w-[48%] bg-gradient-to-r from-[#faf9f5]/45 to-transparent sm:block" />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1600px] flex-col px-4 py-5 sm:h-full sm:min-h-0 sm:px-5 sm:py-[clamp(0.75rem,2.5vh,1.5rem)]">
        <header>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Saathi home">
            <SaathiLogo className="size-10 border-[#dfe8e5] bg-white/80 p-1.5 sm:size-8 lg:size-10" priority />
            <span className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#122039] sm:text-base lg:text-[1.55rem]">Saathi</span>
          </Link>
        </header>

        <div className="flex min-w-0 flex-1 items-center py-8 sm:min-h-0 sm:items-start sm:py-0 sm:pl-[clamp(3rem,9vw,8rem)] sm:pt-[clamp(2rem,6vh,4.5rem)]">
          <section className="w-full min-w-0 sm:w-[clamp(14rem,34vw,33.75rem)]">
            <div className="w-full rounded-[1.5rem] bg-white/95 p-5 shadow-[0_24px_70px_rgba(42,61,70,0.09)] sm:rounded-2xl sm:p-[clamp(0.625rem,2.5vh,2rem)] lg:rounded-[1.5rem] lg:p-[clamp(1.25rem,3vh,1.75rem)]">
              <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#122039] transition-colors hover:text-[#0f766e] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:text-sm">
                <ArrowLeft className="size-4 text-[#0f766e] sm:size-3 lg:size-4" aria-hidden="true" />
                Back
              </Link>

              <div className="mt-7 sm:mt-[clamp(0.5rem,2.5vh,1.25rem)] lg:mt-[clamp(1rem,2.5vh,1.5rem)]">
                <h1 className="text-[2rem] font-semibold leading-none tracking-[-0.055em] text-[#122039] sm:text-[clamp(1.1rem,4.5vh,2.5rem)] lg:text-[clamp(1.75rem,4vh,2.25rem)]">{isSignup ? "Create an account" : "Sign in"}</h1>
              </div>

              {passwordResetComplete && !confirmation && <div role="status" className="mt-5 rounded-xl border border-[#b9ddd3] bg-[#f1faf7] p-4 text-sm leading-5 text-[#245b51]"><p className="font-semibold text-[#122039]">Password updated</p><p className="mt-1">Sign in with your new password.</p></div>}

              {confirmation ? (
                <div role="status" className="mt-8 space-y-4 rounded-xl border border-[#dfe8e5] bg-[#f5faf8] p-5">
                  <h3 className="font-semibold text-[#122039]">Check your email</h3>
                  <p className="text-sm leading-6 text-[#66758d]">{confirmation}</p>
                  <Link href={signInHref} className="text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline">Return to sign in</Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} aria-busy={!hydrated || loading} className="mt-7 space-y-4 sm:mt-[clamp(0.35rem,1.5vh,1rem)] sm:space-y-[clamp(0.25rem,1vh,0.75rem)] lg:mt-[clamp(0.75rem,2vh,1.25rem)] lg:space-y-[clamp(0.5rem,1.2vh,0.875rem)]">
                  {isSignup && (
                    <FieldShell label="Name">
                      <Input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" autoComplete="name" disabled={!hydrated || loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:text-sm" />
                    </FieldShell>
                  )}

                  <FieldShell label="Email">
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" disabled={!hydrated || loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:text-sm" />
                  </FieldShell>

                  <FieldShell label="Password">
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Create a password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} disabled={!hydrated || loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 pr-12 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:pr-8 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:pr-10 lg:text-sm" />
                      <button type="button" disabled={!hydrated || loading} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#8290a5] transition-colors hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] lg:right-3 lg:p-2" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="size-4 lg:size-5" aria-hidden="true" /> : <Eye className="size-4 lg:size-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </FieldShell>

                  {!isSignup && (
                    <div className="flex justify-end pt-1 text-xs lg:text-sm">
                      <Link className="font-semibold text-[#0f766e] hover:underline" href="/forgot-password">Forgot password?</Link>
                    </div>
                  )}

                  {formError && <p role="alert" className="rounded-xl border border-[#f1b8b1] bg-[#fff4f1] px-4 py-3 text-sm leading-5 text-[#b42318]">{formError}</p>}

                  <Button type="submit" className="h-14 w-full rounded-xl bg-[#237f72] text-sm shadow-none hover:bg-[#1d6b60] sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:text-sm" disabled={!hydrated || loading}>
                    {loading ? <><Loader2 className="size-4 animate-spin" />{isSignup ? "Creating account" : "Signing in"}</> : isSignup ? "Create account" : "Sign in"}
                  </Button>
                </form>
              )}

              <p className="mt-8 text-center text-sm text-[#5f6c80] sm:mt-[clamp(0.35rem,1.5vh,1rem)] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:mt-[clamp(0.75rem,1.5vh,1rem)] lg:text-sm">
                {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
                <Link href={isSignup ? signInHref : registerHref} className="font-semibold text-[#0f766e] hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 sm:space-y-[clamp(0.125rem,0.6vh,0.375rem)] lg:space-y-1">
      <span className="flex items-center text-base font-medium text-[#122039] sm:text-[clamp(0.6rem,2.2vh,0.875rem)] lg:text-sm">{label}</span>
      {children}
    </label>
  )
}
