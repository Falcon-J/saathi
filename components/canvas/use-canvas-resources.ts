"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCanvasResources } from "@/features/access/actions"
import type { AuthorizedCanvasView } from "@/features/access/service"
import { createCoalescedRefresh } from "@/lib/read-coordinator"

export function useCanvasResources(actorId: string, refreshSignal: number) {
  const scope = actorId
  const [state, setState] = useState<AuthorizedCanvasView & { scope: string; error: string | null; loading: boolean }>({ scope, resources: [], references: [], error: null, loading: true })
  const refresh = useRef<{ scope: string; run: () => Promise<boolean> } | null>(null)
  const reload = useCallback(() => refresh.current?.scope === scope ? refresh.current.run() : Promise.resolve(false), [scope])
  useEffect(() => {
    let active = true
    const entry = { scope, run: createCoalescedRefresh(async () => {
      if (!active) return false
      try {
        const result = await getCanvasResources()
        if (!active) return false
        setState({ scope, resources: result.success ? result.resources : [], references: result.success ? result.references : [], error: result.success ? null : result.error, loading: false })
        return result.success
      } catch {
        if (active) setState({ scope, resources: [], references: [], error: "Company canvas is unavailable. Try again.", loading: false })
        return false
      }
    }) }
    const refreshRef = refresh
    refreshRef.current = entry
    return () => { active = false; if (refreshRef.current === entry) refreshRef.current = null }
  }, [scope])
  useEffect(() => { void reload() }, [reload, refreshSignal])
  const current = state.scope === scope ? state : null
  return { resources: current?.resources ?? [], references: current?.references ?? [],
    error: current?.error ?? null, loading: current?.loading ?? true, reload }
}
