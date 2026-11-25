import Link from 'next/link'
import { AuthShell } from '@/components/auth-shell'
import { Button } from '@/components/ui/button'
import { safeAuthRedirect } from '@/lib/supabase/auth-boundary'

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams
  const next = safeAuthRedirect(typeof params.next === 'string' ? params.next : null)
  const signInHref = `/login?redirect=${encodeURIComponent(next)}`
  return <AuthShell eyebrow="Sign in" title="That didn't go through" description="Try signing in again. If you followed an email link, open the latest email in the browser where you asked for it.">
    <div className="mt-8 flex flex-col gap-2">
      <Button asChild size="lg" className="w-full"><Link href={signInHref}>Sign in</Link></Button>
      {next === '/reset-password' && <Button asChild variant="outline" size="lg" className="w-full"><Link href="/forgot-password">Request a reset link</Link></Button>}
    </div>
  </AuthShell>
}
