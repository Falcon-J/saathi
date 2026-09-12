import Link from "next/link"
import Image from "next/image"
import { ArrowRight, BarChart3, ListChecks, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen overflow-hidden">
      <header>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#product" className="transition-colors hover:text-foreground">Product</Link>
            <Link href="#features" className="transition-colors hover:text-foreground">Features</Link>
            <Link href="/guide" className="transition-colors hover:text-foreground">Guide</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-foreground"><Link href="/login">Sign in</Link></Button>
            <Button asChild className="rounded-full"><Link href="/register">Get started <span className="sr-only">Create an account</span></Link></Button>
          </div>
        </div>
      </header>

      <section id="product" className="mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-center lg:gap-16 lg:px-8 lg:pt-20">
        <div className="relative z-10 max-w-xl">
          <p className="saathi-label text-primary">A calmer way to move together</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-foreground sm:text-6xl lg:text-7xl">
            Turn shared intent into <span className="text-primary">clear progress.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground sm:text-xl">
            Saathi gives your team one focused workspace to decide what matters, take the next step, and see the work move forward.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/register">Create your workspace <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link href="/guide">See how it works</Link>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>One shared outcome</span><span className="text-border">•</span><span>Clear next tasks</span><span className="text-border">•</span><span>Visible ownership</span>
          </div>
        </div>

        <section className="relative min-h-[400px] overflow-hidden rounded-[2rem] border border-border bg-[#edf5f1] shadow-[var(--saathi-shadow-float)] sm:min-h-[500px]" aria-label="A team turning shared intent into clear next steps">
          <Image src="/saathi-landing-hero.png" alt="A team turning shared intent into clear next steps" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover object-center" />
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 sm:inset-x-6 sm:bottom-6">
            <span className="rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur">Plan together</span>
            <span className="rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">Make progress visible</span>
          </div>
        </section>
      </section>

      <section id="features" className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-2xl">
            <p className="saathi-label text-primary">Everything in one place</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Keep the next step easy to find.</h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">A small set of practical tools keeps your team aligned without adding another layer of process.</p>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            { icon: ListChecks, title: "Clear next steps", copy: "Turn ideas into actionable plans with clarity." },
            { icon: UsersRound, title: "Shared ownership", copy: "Keep everyone aligned and accountable." },
            { icon: BarChart3, title: "Visible progress", copy: "See what’s moving, what’s next, and what’s done." },
          ].map(({ icon: Icon, title, copy }) => (
            <article key={title} className="flex gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            </article>
          ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2"><SaathiLogo className="size-7" /><span className="font-medium text-foreground">Saathi</span></div>
        <p>Focused work. Shared progress.</p>
      </footer>
    </main>
  )
}
