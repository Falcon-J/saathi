"use client"

import { useEffect, useState } from "react"
import { searchCanvas } from "@/app/actions/canvas-search"
import type { CanvasSearchResult } from "@/features/canvas/search"

export function useCanvasSearch(query: string, enabled: boolean, resourceId: string | undefined, revision: string) {
  const normalized = query.trim()
  const key = JSON.stringify([enabled, normalized, resourceId, revision])
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; items: CanvasSearchResult[]; error?: string } | null>(null)
  const active = enabled && normalized.length >= 2 && normalized.length <= 120
  useEffect(() => {
    if (!active) return
    let current = true
    const timer = setTimeout(() => {
      void searchCanvas({ query: normalized, ...(resourceId ? { resourceId } : {}) }).then(value => {
        if (current) setResult({ key, items: "items" in value ? value.items : [], ...("error" in value ? { error: value.error } : {}) })
      }).catch(() => { if (current) setResult({ key, items: [], error: "Search unavailable. Try again." }) })
    }, 200)
    return () => { current = false; clearTimeout(timer) }
  }, [active, key, normalized, resourceId, retry])
  const visible = active && result?.key === key ? result : null
  return { items: visible?.items ?? [], error: visible?.error, loading: active && !visible, retry: () => { setResult(null); setRetry(value => value + 1) } }
}
