import Link from "next/link"
import Image from "next/image"
import { ArrowRight, BarChart3, Check, CheckCircle2, ListChecks, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen">
      <header className="bg-transparent">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#product" className="hover:text-foreground">Product</Link><Link href="#features" className="hover:text-foreground">Features</Link><span className="cursor-not-allowed text-muted-foreground/60" aria-disabled="true" title="Pricing is not available yet">Pricing</span><Link href="/guide" className="hover:text-foreground">About</Link>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-foreground"><Link href="/login">Sign in</Link></Button>
            <Button asChild className="hidden rounded-full sm:inline-flex"><Link href="/register">Get started <span className="sr-only">Create an account</span></Link></Button>
          </div>
        </div>
      </header>

      <section id="product" className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <p className="saathi-label text-primary">From intention to execution</p>
          <p className="sr-only">Move work forward. A focused workspace for teams that build together.</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-foreground sm:text-6xl lg:text-7xl">
            Turn ideas into<br />real progress<br />with <span className="text-primary">Saathi.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground sm:text-xl">
            Saathi is an outcome driven collaborative workspace for individuals and teams. Plan, assign, track and ship — all in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full">
              <Link href="/register">Get started for free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login"><span className="mr-1 grid size-5 place-items-center rounded-full border border-primary/30 text-primary">▶</span>Watch demo</Link>
            </Button>
          </div>
        </div>

        <section className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_52%_45%,#eeecff_0%,#f7f8fc_62%,transparent_74%)]" aria-label="Saathi collaborative planning illustration">
          <Image src="/saathi-hero-texture.png" alt="" fill className="object-cover opacity-30 mix-blend-multiply" priority />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_48%,transparent_0%,transparent_35%,#f7f8fc_78%)]" />
          <div className="absolute left-[11%] top-[17%] w-[58%] rotate-[-7deg] rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[var(--saathi-shadow-float)] backdrop-blur-sm sm:p-7">
            <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-white"><Check className="size-5" /></span><div><p className="text-lg font-semibold leading-tight sm:text-xl">Build something<br />great together.</p><div className="mt-4 flex -space-x-2"><span className="size-7 rounded-full border-2 border-white bg-[#f4b6a6]" /><span className="size-7 rounded-full border-2 border-white bg-[#9db5ff]" /><span className="size-7 rounded-full border-2 border-white bg-[#f2d18d]" /><span className="grid size-7 place-items-center rounded-full border-2 border-white bg-white text-xs text-primary">+</span></div></div></div>
          </div>
          <div className="absolute right-[8%] top-[34%] w-[34%] rotate-[8deg] rounded-2xl border border-white/80 bg-white/85 p-5 shadow-[var(--saathi-shadow-float)] backdrop-blur-sm sm:p-6"><div className="space-y-3 text-sm font-medium"><p className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" />Plan</p><p className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" />Execute</p><p className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" />Ship</p></div></div>
          <div className="absolute bottom-[12%] left-[43%] rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-center text-sm font-medium shadow-[var(--saathi-shadow-float)] backdrop-blur-sm sm:px-7 sm:py-5">Ideas<br /><span className="text-primary">→</span><br />Impact</div>
          <div className="absolute bottom-[6%] right-[8%] text-5xl text-primary/80">⌁</div>
        </section>
      </section>

      <section id="features" className="border-t border-border bg-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: ListChecks, title: "Plan with clarity", copy: "Turn ideas into structured plans." },
            { icon: UsersRound, title: "Work together", copy: "Align and move as a team." },
            { icon: BarChart3, title: "Stay on track", copy: "Make progress, faster." },
          ].map(({ icon: Icon, title, copy }) => (
            <article key={title} className="flex gap-3 border-r-0 border-border last:border-0 md:border-r md:px-5 md:first:pl-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
