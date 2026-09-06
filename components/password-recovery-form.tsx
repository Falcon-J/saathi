"use client"

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { requestPasswordReset, updatePassword } from '@/lib/auth-simple'
import { SaathiLogo } from '@/components/saathi-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  return <main className="saathi-shell flex min-h-screen items-center justify-center px-4 py-10">
    <section className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8">
      <Link href="/" aria-label="Saathi home"><SaathiLogo className="size-10" /></Link>
      <h1 className="text-2xl font-semibold">{mode === 'request' ? 'Reset your password' : 'Choose a new password'}</h1>
      {message ? <p role="status">{message}</p> : <form onSubmit={submit} className="space-y-4">
        {mode === 'request' ? <label className="block space-y-2"><span>Email</span><Input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></label> : <>
          <label className="block space-y-2"><span>New password</span><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></label>
          <label className="block space-y-2"><span>Confirm password</span><Input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirm} onChange={event => setConfirm(event.target.value)} disabled={pending} /></label>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={pending}>{pending ? 'Please wait…' : mode === 'request' ? 'Send reset link' : 'Update password'}</Button>
      </form>}
      <Link className="block text-sm text-primary underline" href="/login">Back to sign in</Link>
    </section>
  </main>
}
