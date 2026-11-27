import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { GeistPixelSquare } from "geist/font/pixel/square"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "Saathi", template: "%s · Saathi" },
  description: "Task coordination for people and AI agents.",
  icons: { icon: "/icon.svg" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141417" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}>
      <body>{children}</body>
    </html>
  )
}
