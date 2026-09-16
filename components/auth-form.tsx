"use client"

import React, { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react"
import { login, loginWithGoogle, signup } from "@/lib/auth-simple"
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
  const [keepSignedIn, setKeepSignedIn] = useState(true)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [passwordResetComplete, setPasswordResetComplete] = useState(false)
  const isSignup = mode === "signup"

  useEffect(() => {
    if (!isSignup) setPasswordResetComplete(new URLSearchParams(window.location.search).get("reset") === "success")
  }, [isSignup])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!email.trim() || !password.trim()) {
      setFormError("Email and password are required.")
      return
    }

    if (isSignup && !username.trim()) {
      setFormError("Add your name so teammates can identify you.")
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
          setConfirmation(result.message || "Check your email to verify your account.")
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

  const handleGoogleAuth = async () => {
    setFormError(null)
    setGoogleLoading(true)
    try {
      const next = new URLSearchParams(window.location.search).get("redirect")
      const result = await loginWithGoogle(next)
      if (result.error) {
        setFormError(result.error)
        return
      }
      if (!result.url) {
        setFormError("Could not start Google sign-in. Please try again.")
        return
      }
      window.location.assign(result.url)
    } catch (error) {
      console.error("Google auth error:", error)
      setFormError("Could not start Google sign-in. Please try again.")
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <main className="relative isolate min-h-[100svh] overflow-x-hidden bg-[#faf9f5] text-[#122039] sm:h-[100svh] sm:overflow-hidden">
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
                {!isSignup && <p className="mt-1 text-sm leading-5 text-[#66758d] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] sm:leading-tight lg:text-sm lg:leading-5">Enter your details to continue.</p>}
              </div>

              {passwordResetComplete && !confirmation && <div role="status" className="mt-5 rounded-xl border border-[#b9ddd3] bg-[#f1faf7] p-4 text-sm leading-5 text-[#245b51]"><p className="font-semibold text-[#122039]">Password updated</p><p className="mt-1">Sign in with your new password.</p></div>}

              {confirmation ? (
                <div role="status" className="mt-8 space-y-4 rounded-xl border border-[#dfe8e5] bg-[#f5faf8] p-5">
                  <h3 className="font-semibold text-[#122039]">Check your email</h3>
                  <p className="text-sm leading-6 text-[#66758d]">{confirmation}</p>
                  <Link href="/login" className="text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline">Return to sign in</Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-7 space-y-4 sm:mt-[clamp(0.35rem,1.5vh,1rem)] sm:space-y-[clamp(0.25rem,1vh,0.75rem)] lg:mt-[clamp(0.75rem,2vh,1.25rem)] lg:space-y-[clamp(0.5rem,1.2vh,0.875rem)]">
                  {isSignup && (
                    <FieldShell label="Name">
                      <Input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" autoComplete="name" disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:text-sm" />
                    </FieldShell>
                  )}

                  <FieldShell label="Email">
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:text-sm" />
                  </FieldShell>

                  <FieldShell label="Password">
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Create a password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 pr-12 text-base sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:pr-8 sm:text-[clamp(0.6rem,2.1vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:px-3 lg:pr-10 lg:text-sm" />
                      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[#8290a5] transition-colors hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] lg:right-3 lg:p-2" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="size-4 lg:size-5" aria-hidden="true" /> : <Eye className="size-4 lg:size-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </FieldShell>

                  {!isSignup && (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1 text-xs lg:gap-x-4 lg:gap-y-3 lg:text-sm">
                      <label className="inline-flex cursor-pointer items-center gap-2.5 text-[#122039]">
                        <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} className="size-4 accent-[#0f766e] lg:size-5" />
                        Keep me signed in
                      </label>
                      <Link className="font-semibold text-[#0f766e] hover:underline" href="/forgot-password">Forgot password?</Link>
                    </div>
                  )}

                  {formError && <p role="alert" className="rounded-xl border border-[#f1b8b1] bg-[#fff4f1] px-4 py-3 text-sm leading-5 text-[#b42318]">{formError}</p>}

                  <Button type="submit" className="h-14 w-full rounded-xl bg-[#2c9887] text-sm shadow-none hover:bg-[#237f72] sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:text-sm" disabled={loading}>
                    {loading ? <><Loader2 className="size-4 animate-spin" />{isSignup ? "Creating account" : "Signing in"}</> : isSignup ? "Create account" : "Sign in"}
                  </Button>
                </form>
              )}

              {!confirmation && <>
                <div className="my-7 flex items-center gap-3 text-xs text-[#718096] sm:my-[clamp(0.25rem,1.2vh,0.75rem)] lg:my-[clamp(0.5rem,1.5vh,1rem)] lg:gap-4 lg:text-xs">
                  <span className="h-px flex-1 bg-[#dbe2e8]" aria-hidden="true" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-[#dbe2e8]" aria-hidden="true" />
                </div>

                <div className="grid gap-3 sm:gap-[clamp(0.25rem,1vh,0.5rem)] lg:gap-[clamp(0.4rem,1vh,0.625rem)]">
                  <GoogleButton onClick={handleGoogleAuth} loading={googleLoading} disabled={loading || googleLoading} />
                </div>
              </>}

              <p className="mt-8 text-center text-sm text-[#718096] sm:mt-[clamp(0.35rem,1.5vh,1rem)] sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:mt-[clamp(0.75rem,1.5vh,1rem)] lg:text-sm">
                {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
                <Link href={isSignup ? "/login" : "/register"} className="font-semibold text-[#0f766e] hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
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

function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-[#cbd4df] bg-white px-3 text-sm font-medium text-[#122039] transition-colors hover:border-[#8eb9b0] hover:bg-[#f7fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60 sm:h-[clamp(1.5rem,6vh,2.75rem)] sm:px-2 sm:text-[clamp(0.65rem,2.3vh,0.875rem)] lg:h-[clamp(2.5rem,5.5vh,3rem)] lg:gap-3 lg:px-4 lg:text-sm">
      {loading ? <Loader2 className="size-5 animate-spin sm:size-3 lg:size-4" aria-hidden="true" /> : <GoogleMark />}
      {loading ? "Connecting to Google" : "Continue with Google"}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 sm:size-3 lg:size-4" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.2Z" />
      <path fill="#34A853" d="M12 21.68c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.75 9.75 0 0 0 12 21.68Z" />
      <path fill="#FBBC05" d="M6.53 13.77a5.86 5.86 0 0 1 0-3.54V7.7H3.28a9.76 9.76 0 0 0 0 8.6l3.25-2.53Z" />
      <path fill="#EA4335" d="M12 6.2c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.3 14.63 2.32 12 2.32a9.75 9.75 0 0 0-8.72 5.38l3.25 2.53C7.3 7.92 9.46 6.2 12 6.2Z" />
    </svg>
  )
}
