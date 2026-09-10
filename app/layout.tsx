import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Saathi — Move from intention to action",
  description: "A focused collaborative workspace for planning what matters and moving it forward together.",
  icons: {
    icon: "/saathi-logo-mark.png",
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}
