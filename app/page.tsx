"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { getSession } from "@/lib/auth-simple"
import LandingPage from "./landing/page"

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (hasChecked) return // Prevent multiple auth checks

    const checkAuth = async () => {
      try {
        const session = await getSession()
        if (session) {
          setIsAuthenticated(true)
          router.replace("/dashboard") // Use replace instead of push to avoid history issues
        } else {
          setIsAuthenticated(false)
        }
      } catch (error) {
        console.error("Auth check failed:", error)
        setIsAuthenticated(false)
      } finally {
        setLoading(false)
        setHasChecked(true)
      }
    }
    checkAuth()
  }, [hasChecked, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Saathi...</p>
        </div>
      </main>
    )
  }

  if (isAuthenticated) {
    return null // Will redirect to dashboard
  }

  return <LandingPage />
}
