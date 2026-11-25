import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PasswordRecoveryForm } from '@/components/password-recovery-form'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  let authenticated = false
  try {
    const client = await createClient({ readOnly: true })
    const { data: { user }, error } = await client.auth.getUser()
    authenticated = !error && !!user?.email_confirmed_at
  } catch { /* Fail closed and offer a new recovery request. */ }
  if (authenticated) return <PasswordRecoveryForm mode="update" />
  return <AuthShell eyebrow="Account recovery" title="This link has expired" description="Open the latest reset email in the browser where you asked for it, or request a new link." backHref="/login" backLabel="Back to sign in">
    <Button asChild size="lg" className="mt-8 w-full"><Link href="/forgot-password">Request a new link</Link></Button>
  </AuthShell>
}
