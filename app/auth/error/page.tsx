import Link from 'next/link'
import { SaathiLogo } from '@/components/saathi-logo'

export default function AuthErrorPage() {
  return <main className="saathi-shell flex min-h-screen items-center justify-center px-4">
    <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8">
      <Link href="/" aria-label="Saathi home"><SaathiLogo className="size-10" /></Link>
      <h1 className="text-2xl font-semibold">This link could not be verified</h1>
      <p className="text-muted-foreground">It may have expired, already been used, or opened in a different browser. Open the latest email in the browser where you requested it.</p>
      <div className="flex gap-4"><Link className="text-primary underline" href="/login">Sign in</Link><Link className="text-primary underline" href="/forgot-password">Request a reset link</Link></div>
    </section>
  </main>
}
