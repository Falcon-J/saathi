import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PasswordRecoveryForm } from '@/components/password-recovery-form'

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  let authenticated = false
  try {
    const client = await createClient({ readOnly: true })
    const { data: { user }, error } = await client.auth.getUser()
    authenticated = !error && !!user?.email_confirmed_at
  } catch { /* Fail closed and offer a new recovery request. */ }
  if (authenticated) return <PasswordRecoveryForm mode="update" />
  return <main className="saathi-shell flex min-h-screen items-center justify-center p-6"><section className="max-w-md space-y-4 rounded-xl border bg-card p-8"><h1 className="text-2xl font-semibold">Your recovery link is unavailable</h1><p>Open the latest reset link in the browser where you requested it, or request a new one.</p><Link href="/forgot-password" className="text-primary underline">Request a reset link</Link></section></main>
}
