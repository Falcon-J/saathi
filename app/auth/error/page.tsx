import Link from 'next/link'
import Image from 'next/image'
import { SaathiLogo } from '@/components/saathi-logo'
import { safeAuthRedirect } from '@/lib/supabase/auth-boundary'

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams
  const next = safeAuthRedirect(typeof params.next === 'string' ? params.next : null)
  const signInHref = `/login?redirect=${encodeURIComponent(next)}`
  return <main className="saathi-shell grid min-h-screen place-items-center px-4 py-10">
    <section className="w-full max-w-xl rounded-[var(--saathi-radius-container)] border border-border bg-card p-8 text-center shadow-[var(--saathi-shadow-card)] sm:p-12">
      <Link href="/" aria-label="Saathi home"><SaathiLogo className="mx-auto size-12" /></Link>
      <Image src="/saathi-unavailable-illustration.png" alt="" width={180} height={180} className="mx-auto mt-6 h-40 w-40 object-contain" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Sign in could not be completed</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">Try signing in again. If you followed an email link, open the latest email in the browser where you requested it.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Link className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" href={signInHref}>Sign in</Link>{next === '/reset-password' && <Link className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium" href="/forgot-password">Request a reset link</Link>}</div>
    </section>
  </main>
}
