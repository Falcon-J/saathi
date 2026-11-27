"use client"
// Shared by every app page: live re-reads over the workspace's private channel, and the offline state.
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

const onLine = (cb: () => void) => { addEventListener("online", cb); addEventListener("offline", cb); return () => { removeEventListener("online", cb); removeEventListener("offline", cb) } }

// Each workspace event is a nudge to re-read, at most every 300 ms. Offline counts down to a retry every 8 s.
export function useLive(ws: string) {
  const router = useRouter()
  const [tick, setTick] = useState(0)
  const offline = !useSyncExternalStore(onLine, () => navigator.onLine, () => true)
  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    let timer = 0
    const nudge = () => { clearTimeout(timer); timer = window.setTimeout(() => router.refresh(), 300) }
    const channel = supabase.channel(`ws:${ws}`, { config: { private: true } }).on("broadcast", { event: "*" }, nudge)
    void supabase.realtime.setAuth().then(() => channel.subscribe())
    return () => { clearTimeout(timer); void supabase.removeChannel(channel) }
  }, [ws, router])
  const wasOffline = useRef(false)
  useEffect(() => {
    if (!offline) { if (wasOffline.current) router.refresh(); wasOffline.current = false; return }
    wasOffline.current = true
    let n = 0
    const t = setInterval(() => { n++; setTick(n); if (n % 8 === 0) router.refresh() }, 1000)
    return () => clearInterval(t)
  }, [offline, router])
  return { offline, retryIn: 8 - (tick % 8), retry: () => router.refresh() }
}
