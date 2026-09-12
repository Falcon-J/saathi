"use client"

import React, { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Eye, EyeOff, Github, Loader2, Mail, UserRound } from "lucide-react"
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
  const [keepSignedIn, setKeepSignedIn] = useState(true)
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

  const handleSocialAuth = (provider: "Google" | "GitHub") => {
    setFormError(`${provider} sign-in is not available yet. Use your email and password to continue.`)
  }

  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#faf9f5] text-[#122039]">
      <div className="mx-auto flex min-h-[100svh] max-w-[1600px] flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-8">
        <header>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Saathi home">
            <SaathiLogo className="size-10 border-[#dfe8e5] bg-white/80 p-1.5" priority />
            <span className="text-[1.55rem] font-semibold tracking-[-0.04em] text-[#122039]">Saathi</span>
          </Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 lg:min-h-[calc(100svh-112px)] lg:grid-cols-[minmax(0,0.86fr)_minmax(430px,1fr)] lg:gap-10 lg:py-8 2xl:grid-cols-[minmax(280px,0.76fr)_minmax(500px,0.94fr)_minmax(330px,0.82fr)] 2xl:gap-12">
          <section className="order-1 flex flex-col justify-between self-stretch py-4 lg:py-28">
            <div className="max-w-[440px]">
              <p className="text-sm font-medium tracking-[0.24em] text-[#64807e]">{isSignup ? "GET STARTED" : "WELCOME BACK"}</p>
              <h1 className="mt-8 max-w-[480px] text-[clamp(2.8rem,4.5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.065em] text-[#122039]">
                {isSignup ? "Create your workspace." : "Sign in to your workspace."}
              </h1>
              <p className="mt-8 max-w-[390px] text-xl leading-[1.45] text-[#66758d] sm:text-2xl">
                {isSignup ? "Turn your ideas into progress with your team." : "Pick up where you left off and help the team keep momentum going."}
              </p>
            </div>
            <div className="mt-12 hidden lg:block">
              <p className="max-w-[300px] text-[1.65rem] leading-[1.3] text-[#187f76]">“{isSignup ? "Better work together." : "Clarity today. Progress tomorrow."}”</p>
              <span className="mt-7 block h-2 w-16 rounded-full bg-[#b9d9d1]" aria-hidden="true" />
            </div>
          </section>

          <section className="order-2 w-full justify-self-center">
            <div className="rounded-[1.5rem] bg-white/95 p-7 shadow-[0_24px_70px_rgba(42,61,70,0.09)] sm:p-10">
              <Link href="/" className="inline-flex items-center gap-3 text-base font-semibold text-[#122039] transition-colors hover:text-[#0f766e]">
                <ArrowLeft className="size-5 text-[#0f766e]" aria-hidden="true" />
                Back
              </Link>

              <div className="mt-10">
                <p className="text-sm font-medium tracking-[0.2em] text-[#64807e] lg:hidden">{isSignup ? "GET STARTED" : "WELCOME BACK"}</p>
                <h2 className="mt-3 text-[2.25rem] font-semibold leading-none tracking-[-0.055em] text-[#122039] sm:text-[2.5rem]">{isSignup ? "Create an account" : "Sign in"}</h2>
                <p className="mt-3 text-lg leading-7 text-[#66758d]">{isSignup ? "Start moving your team’s work forward." : "Enter your details to continue."}</p>
              </div>

              {confirmation ? (
                <div role="status" className="mt-8 space-y-4 rounded-xl border border-[#dfe8e5] bg-[#f5faf8] p-5">
                  <h3 className="font-semibold text-[#122039]">Check your email</h3>
                  <p className="text-sm leading-6 text-[#66758d]">{confirmation}</p>
                  <Link href="/login" className="text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline">Return to sign in</Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  {isSignup && (
                    <FieldShell label="Name" icon={<UserRound className="size-4" aria-hidden="true" />}>
                      <Input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" autoComplete="name" disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base" />
                    </FieldShell>
                  )}

                  <FieldShell label="Email" icon={<Mail className="size-4" aria-hidden="true" />}>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 text-base" />
                  </FieldShell>

                  <FieldShell label="Password" icon={null}>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignup ? "Create a password" : "Enter your password"} autoComplete={isSignup ? "new-password" : "current-password"} disabled={loading} required className="h-14 rounded-xl border-[#cbd4df] px-4 pr-12 text-base" />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#8290a5] transition-colors hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                      </button>
                    </div>
                  </FieldShell>

                  {!isSignup && (
                    <div className="flex items-center justify-between gap-4 pt-1 text-sm">
                      <label className="inline-flex cursor-pointer items-center gap-2.5 text-[#122039]">
                        <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} className="size-5 accent-[#0f766e]" />
                        Keep me signed in
                      </label>
                      <Link className="font-semibold text-[#0f766e] hover:underline" href="/forgot-password">Forgot password?</Link>
                    </div>
                  )}

                  {formError && <p role="alert" className="rounded-xl border border-[#f1b8b1] bg-[#fff4f1] px-4 py-3 text-sm leading-5 text-[#b42318]">{formError}</p>}

                  <Button type="submit" className="h-14 w-full rounded-xl bg-[#2c9887] text-base shadow-none hover:bg-[#237f72]" disabled={loading}>
                    {loading ? <><Loader2 className="size-4 animate-spin" />{isSignup ? "Creating account" : "Signing in"}</> : isSignup ? "Create account" : "Sign in"}
                  </Button>
                </form>
              )}

              {!confirmation && <>
                <div className="my-7 flex items-center gap-4 text-sm text-[#718096]">
                  <span className="h-px flex-1 bg-[#dbe2e8]" aria-hidden="true" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-[#dbe2e8]" aria-hidden="true" />
                </div>

                <div className="grid gap-3">
                  <SocialButton provider="Google" onClick={() => handleSocialAuth("Google")} />
                  <SocialButton provider="GitHub" onClick={() => handleSocialAuth("GitHub")} />
                </div>
              </>}

              <p className="mt-8 text-center text-base text-[#718096]">
                {isSignup ? "Already have an account?" : "New to Saathi?"}{" "}
                <Link href={isSignup ? "/login" : "/register"} className="font-semibold text-[#0f766e] hover:underline">{isSignup ? "Sign in" : "Create an account"}</Link>
              </p>
            </div>
          </section>

          <section className="order-3 relative h-[260px] overflow-hidden rounded-[1.5rem] sm:h-[340px] lg:col-span-2 lg:h-[300px] 2xl:col-span-1 2xl:h-[min(70vh,720px)] 2xl:rounded-none" aria-label="Saathi workspace illustration">
            <Image src="/saathi-auth-hero.png" alt="A leafy plant beside stacked blocks representing ideas, people, and progress" fill sizes="(max-width: 1023px) 100vw, 35vw" className="object-cover object-right" priority />
          </section>
        </div>
      </div>
    </main>
  )
}

function FieldShell({ label, icon, children }: { label: string; icon: React.ReactNode | null; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-base font-medium text-[#122039]">{icon}{label}</span>
      {children}
    </label>
  )
}

function SocialButton({ provider, onClick }: { provider: "Google" | "GitHub"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-[#cbd4df] bg-white text-base font-medium text-[#122039] transition-colors hover:border-[#8eb9b0] hover:bg-[#f7fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]">
      {provider === "Google" ? <GoogleMark /> : <Github className="size-5" aria-hidden="true" />}
      {provider === "Google" ? "Continue with Google" : "Continue with GitHub"}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.35 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.2Z" />
      <path fill="#34A853" d="M12 21.68c2.63 0 4.84-.87 6.45-2.35l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.75 9.75 0 0 0 12 21.68Z" />
      <path fill="#FBBC05" d="M6.53 13.77a5.86 5.86 0 0 1 0-3.54V7.7H3.28a9.76 9.76 0 0 0 0 8.6l3.25-2.53Z" />
      <path fill="#EA4335" d="M12 6.2c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.3 14.63 2.32 12 2.32a9.75 9.75 0 0 0-8.72 5.38l3.25 2.53C7.3 7.92 9.46 6.2 12 6.2Z" />
    </svg>
  )
}
