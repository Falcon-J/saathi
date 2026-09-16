"use client"

import { useEffect, useState } from "react"
import { getDashboardGreetingForHour } from "@/lib/dashboard-greeting"

export function TimeSensitiveGreeting({ username }: { username: string }) {
  const [greeting, setGreeting] = useState("Welcome back")

  useEffect(() => {
    const updateGreeting = () => setGreeting(getDashboardGreetingForHour(new Date().getHours()))
    updateGreeting()
    window.addEventListener("focus", updateGreeting)
    const intervalId = window.setInterval(updateGreeting, 60_000)
    return () => {
      window.removeEventListener("focus", updateGreeting)
      window.clearInterval(intervalId)
    }
  }, [])

  return <>{greeting}, {username}.</>
}
