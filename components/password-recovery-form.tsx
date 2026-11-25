"use client"

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { requestPasswordReset, updatePassword, logout } from '@/lib/auth-simple'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle2 } from 'lucide-react'

export function PasswordRecoveryForm({ mode }: { mode: 'request' | 'update' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const pendingRequest = useRef(false)
  useEffect(() => { setHydrated(true) }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!hydrated || pendingRequest.current) return
    setError('')
    if (mode === 'update' && password !== confirm) { setError('Passwords do not match.'); return }
    pendingRequest.current = true
    setPending(true)
    try {
      const result = mode === 'request' ? await requestPasswordReset(email) : await updatePassword(password)
      if (result.error) setError(result.error)
      else if (result.success) {
        if (mode === 'update' && result.sessionEnded === false) {
          setMessage(result.message || 'Password updated. Sign out to finish.')
        } else if (mode === 'update') {
          router.replace('/login?reset=success')
          router.refresh()
        } else {
          setMessage(result.message || 'Request completed.')
        }
      }
    } catch { setError('Account service is temporarily unavailable. Please try again.') }
    finally { pendingRequest.current = false; setPending(false) }
  }
  async function finishSignOut() {
    if (pendingRequest.current) return
    pendingRequest.current = true
    setPending(true)
    setError('')
    try {
      const result = await logout()
      if (result.error || !result.success) { setError(result.error || 'Could not sign out. Please try again.'); return }
      router.replace('/login?reset=success')
      router.refresh()
    } catch { setError('Could not sign out. Please try again.') }
    finally { pendingRequest.current = false; setPending(false) }
  }
  const requesting = mode === 'request'
  return <AuthShell eyebrow={requesting ? 'Account recovery' : 'Almost done'} title={requesting ? 'Reset your password' : 'Set a new password'} description={requesting ? "Enter your account email and we'll send you a reset link." : 'Choose a new password for your account.'} backHref="/login" backLabel="Back to sign in">
        <div className="mt-8">
          {message ? <div role="status" className="rounded-lg border border-border bg-card p-4"><p className="font-semibold">{requesting ? 'Check your inbox' : 'Password updated'}</p><p className="mt-2 text-sm text-muted-foreground">{message}</p>{!requesting && <Button type="button" disabled={pending} onClick={() => void finishSignOut()} className="mt-4">{pending ? 'Signing out…' : 'Sign out'}</Button>}{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</div> : <form onSubmit={submit} aria-busy={!hydrated || pending} className="space-y-4">
            {requesting ? <label className="block space-y-2"><span className="block text-sm font-medium">Email</span><Input className="h-11" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={event => setEmail(event.target.value)} disabled={!hydrated || pending} /></label> : <>
              <label className="block space-y-2"><span className="block text-sm font-medium">New password</span><Input className="h-11" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={!hydrated || pending} /></label>
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-[var(--saathi-success)]" />Use at least 8 characters.</p>
              <label className="block space-y-2"><span className="text-sm font-medium">Confirm new password</span><Input className="h-11" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={!hydrated || pending} /></label>
            </>}
            {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button size="lg" className="w-full disabled:opacity-100" disabled={!hydrated || pending} loading={pending}>{pending ? 'Please wait' : requesting ? 'Send reset link' : 'Reset password'}</Button>
          </form>}
        </div>
  </AuthShell>
}
