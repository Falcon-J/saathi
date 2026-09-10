"use client"

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { requestPasswordReset, updatePassword } from '@/lib/auth-simple'
import { SaathiLogo } from '@/components/saathi-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2, KeyRound, Mail } from 'lucide-react'

export function PasswordRecoveryForm({ mode }: { mode: 'request' | 'update' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setError('')
    if (mode === 'update' && password !== confirm) { setError('Passwords do not match.'); return }
    setPending(true)
    try {
      const result = mode === 'request' ? await requestPasswordReset(email) : await updatePassword(password)
      if (result.error) setError(result.error)
      else if (result.success) setMessage(result.message || 'Request completed.')
    } catch { setError('Account service is temporarily unavailable. Please try again.') }
    finally { setPending(false) }
  }
  const requesting = mode === 'request'
  return <main className="saathi-shell min-h-screen">
    <header className="border-b border-border bg-card"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8"><Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home"><SaathiLogo className="size-9" /><span className="text-lg font-semibold">Saathi</span></Link><Link className="text-sm text-muted-foreground hover:text-foreground" href="/login">Back to sign in</Link></div></header>
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
      <section className="mx-auto w-full max-w-md">
        <p className="saathi-label text-primary">{requesting ? 'Forgot password' : 'Reset password'}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-[-0.04em]">{requesting ? 'Forgot your password?' : 'Set a new password'}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{requesting ? "Enter your email and we'll send you a secure reset link." : 'Choose a strong password to secure your account and return to your work.'}</p>
        <div className="mt-7 rounded-[var(--saathi-radius-container)] border border-border bg-card p-6 shadow-[0_16px_48px_rgb(44_50_89/0.08)] sm:p-8">
          {message ? <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="font-semibold">Check your inbox</p><p className="mt-2 text-sm text-muted-foreground">{message}</p></div> : <form onSubmit={submit} className="space-y-4">
            {requesting ? <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-medium"><Mail className="size-4" />Email</span><Input type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></label> : <>
              <label className="block space-y-2"><span className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" />New password</span><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></label>
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-[var(--saathi-success)]" />Use at least 8 characters.</p>
              <label className="block space-y-2"><span className="text-sm font-medium">Confirm new password</span><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} /></label>
            </>}
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button className="h-11 w-full" disabled={pending}>{pending ? 'Please wait…' : requesting ? 'Send reset link' : 'Reset password'}</Button>
          </form>}
        </div>
      </section>
      <aside className="hidden min-h-[430px] items-center justify-center rounded-[2rem] bg-[radial-gradient(circle_at_center,#eeecff_0%,#f7f8fc_70%)] p-10 lg:flex">
        <div className="max-w-sm text-center"><Image src="/saathi-auth-illustration.png" alt="A secure recovery checklist and paper plane" width={320} height={320} className="mx-auto w-full max-w-[320px] object-contain" /><p className="mt-3 font-[cursive] text-2xl text-primary">{requesting ? 'A small step back to big progress.' : 'All set!'}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Your account recovery stays secure and your workspace data remains unchanged.</p></div>
      </aside>
    </div>
  </main>
}
