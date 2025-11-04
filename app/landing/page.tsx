import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Users } from "lucide-react"

export default function LandingPage() {


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 relative overflow-hidden">


      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Saathi</h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link href="/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-10 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-7xl mx-auto text-center">
          {/* Main Heading */}
          <h1
            className="text-5xl sm:text-7xl lg:text-8xl font-bold mb-12 text-center cursor-pointer transition-all duration-300"
          >
            <span
              className="block transition-all duration-300 ease-out bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent"
            >
              Collaborative
              <br />
              Task Management
            </span>
            <br />
            <span className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-primary">
              Built for Teams
            </span>
          </h1>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link href="/register">
              <Button
                size="lg"
                className="w-full sm:w-auto px-8 py-4 text-lg font-semibold transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-primary/30 active:scale-95 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary group"
              >
                <span className="flex items-center gap-2">
                  Start Collaborating
                  <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </Button>
            </Link>

          </div>
        </div>
      </section>
    </div>
  )
}