import Link from "next/link"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SaathiLogo } from "@/components/saathi-logo"

export default function LandingPage() {
  return (
    <main className="saathi-shell min-h-screen overflow-hidden">
      <section id="product" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#f7f7f4]">
        <Image
          src="/saathi-landing-hero.png"
          alt="A team turning shared intent into clear next steps"
          fill
          priority
          sizes="100vw"
          className="z-0 hidden object-cover object-[60%_center] lg:block"
        />
        <div className="absolute inset-0 z-0 hidden bg-gradient-to-r from-[#f7f7f4] via-[#f7f7f4]/85 to-transparent lg:block lg:w-[64%]" />
        <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 pt-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Saathi home">
            <SaathiLogo className="size-9" priority />
            <span className="text-lg font-semibold tracking-tight">Saathi</span>
          </Link>

        </div>
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 pb-8 pt-8 text-center sm:px-6 lg:items-center lg:justify-start lg:px-8 lg:pb-16 lg:pt-0 lg:text-left">
          <div className="w-full max-w-[20rem] sm:max-w-[22rem]">
            <h1 className="max-w-[20rem] text-[clamp(2.75rem,12vw,3.75rem)] font-semibold leading-[0.98] tracking-[-0.06em] text-foreground sm:max-w-[22rem] sm:text-6xl lg:text-6xl">
              Turn shared intent into <span className="text-primary">clear progress.</span>
            </h1>
            <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-2 sm:flex-nowrap lg:justify-start">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/register">Create your workspace <ArrowRight className="size-4" /></Link>
              </Button>
              <Link href="/login" className="inline-flex min-h-11 items-center px-4 text-sm font-medium text-foreground">Sign in</Link>
            </div>
            <div className="mt-6 flex justify-center lg:justify-start">
              <Link href="/guide" className="whitespace-nowrap rounded-full border border-border bg-white/85 px-4 py-2 text-sm text-foreground shadow-sm backdrop-blur transition-colors hover:bg-white">
                See how it works
              </Link>
            </div>
          </div>

        </div>

        <div className="relative z-10 mx-4 mb-4 h-44 overflow-hidden rounded-[1.5rem] sm:h-52 lg:hidden" aria-hidden="true">
          <Image
            src="/saathi-landing-hero.png"
            alt=""
            fill
            sizes="calc(100vw - 2rem)"
            className="object-cover object-[72%_center]"
          />

        </div>

      </section>

    </main>
  )
}
