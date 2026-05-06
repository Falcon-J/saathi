import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { OnboardingProvider } from "@/context/onboarding-context"
import { OnboardingLayout } from "@/components/onboarding-layout"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "Saathi - Collaborative Task Manager",
  description: "Real-time collaborative task management with Redis Streams and Server-Sent Events",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <OnboardingProvider>
            <OnboardingLayout>
              {children}
            </OnboardingLayout>
            <Toaster />
          </OnboardingProvider>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
