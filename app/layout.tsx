import type React from "react"
import type { Metadata, Viewport } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { HistoryPositionProvider } from "@/components/history-position-provider"
import { GeistMono } from "geist/font/mono"
import "@fontsource-variable/inter"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Saathi — Move from intention to action",
  description: "A focused collaborative workspace for planning what matters and moving it forward together.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/saathi-logo-mark.png", type: "image/png" }],
    apple: "/saathi-logo-mark.png",
  },
  openGraph: {
    title: "Saathi — Move from intention to action",
    description: "A focused collaborative workspace for planning what matters and moving it forward together.",
    type: "website",
    images: [{ url: "/saathi-logo-mark.png", width: 512, height: 512, alt: "Saathi logo" }],
  },
  twitter: {
    card: "summary",
    title: "Saathi — Move from intention to action",
    description: "A focused collaborative workspace for planning what matters and moving it forward together.",
    images: ["/saathi-logo-mark.png"],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={GeistMono.variable} suppressHydrationWarning>
      <body className="antialiased">
        <HistoryPositionProvider />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
