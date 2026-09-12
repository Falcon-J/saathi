import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen overflow-hidden">
      <header>
        <div className="mx-auto flex h-20 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>

        </div>
      </header>

      <section id="product" className="relative isolate min-h-[calc(100svh-5rem)] overflow-hidden">
        <Image
          src="/saathi-landing-hero.png"
          alt="A team turning shared intent into clear next steps"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#f7f7f4] via-[#f7f7f4]/85 to-transparent lg:w-[64%]" />
        <div className="relative mx-auto flex min-h-[calc(100svh-5rem)] max-w-7xl items-start px-4 pb-24 pt-[clamp(3rem,15vh,8rem)] sm:px-6 lg:px-8">
        <div className="max-w-[27rem]">
            <h1 className="max-w-[22rem] text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-foreground sm:text-6xl lg:text-6xl">
              Turn shared intent into <span className="text-primary">clear progress.</span>
            </h1>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/register">Create your workspace <ArrowRight className="size-4" /></Link>
              </Button>
              <Link href="/login" className="inline-flex min-h-11 items-center px-4 text-sm font-medium text-foreground">Sign in</Link>
            </div>
        </div>
        </div>
        <Link href="/guide" className="absolute bottom-5 left-4 rounded-full border border-border bg-white/85 px-4 py-2 text-sm text-foreground shadow-sm backdrop-blur transition-colors hover:bg-white sm:bottom-8 sm:left-6 lg:left-8">
          See how it works
        </Link>
      </section>

    </main>
  )
}
