import Link from 'next/link'
import Image from 'next/image'
import { SaathiLogo } from '@/components/saathi-logo'

export default function AuthErrorPage() {
  return <main className="saathi-shell grid min-h-screen place-items-center px-4 py-10">
    <section className="w-full max-w-xl rounded-[var(--saathi-radius-container)] border border-border bg-card p-8 text-center shadow-[var(--saathi-shadow-card)] sm:p-12">
      <Link href="/" aria-label="Saathi home"><SaathiLogo className="mx-auto size-12" /></Link>
      <Image src="/saathi-unavailable-illustration.png" alt="Recovery link unavailable" width={180} height={180} className="mx-auto mt-6 h-40 w-40 object-contain" />
      <p className="saathi-label mt-4 text-primary">Recovery link</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">This link could not be verified</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">It may have expired, already been used, or opened in a different browser. Open the latest email in the browser where you requested it.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Link className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" href="/login">Sign in</Link><Link className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium" href="/forgot-password">Request a reset link</Link></div>
    </section>
  </main>
}
