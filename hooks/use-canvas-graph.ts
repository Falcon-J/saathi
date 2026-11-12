"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { getTaskGraph } from "@/app/actions/task-dependencies"
import type { TaskGraph } from "@/lib/data/task-dependencies"
import type { Workspace } from "@/lib/data/workspaces"
import { deriveNextWork } from "@/lib/next-work"
import { createCoalescedRefresh } from "@/lib/read-coordinator"
import type { AuthorizedWorkspaceGraph } from "@/features/canvas/model"

export function useCanvasGraph(actorId: string, workspace: Workspace | undefined, refreshSignal: number) {
  const workspaceId = workspace?.id
  const scope = JSON.stringify([actorId, workspaceId])
  const active = useRef(scope)
  useLayoutEffect(() => { active.current = scope }, [scope])
  const sequence = useRef(0)
  const refresher = useRef<{ scope: string; run: () => Promise<boolean> } | null>(null)
  const [state, setState] = useState<{ scope: string; graph: TaskGraph | null; error: string | null; loading: boolean }>(
    { scope, graph: null, error: null, loading: Boolean(workspaceId) },
  )
  const read = useCallback(async () => {
    if (active.current !== scope || !workspaceId) return false
    const request = ++sequence.current
    setState(previous => ({ scope, graph: previous.scope === scope ? previous.graph : null, error: null, loading: true }))
    try {
      const result = await getTaskGraph(workspaceId)
      if (active.current !== scope || request !== sequence.current) return false
      if (!result.success) {
        setState({ scope, graph: null, error: result.error, loading: false })
        return false
      }
      if (result.tasks.some(task => task.workspaceId !== workspaceId) || result.dependencies.some(edge => edge.workspaceId !== workspaceId)) {
        throw new Error("Invalid workspace graph")
      }
      deriveNextWork(result.tasks, result.dependencies, result.timezone, new Date(result.asOf))
      setState({ scope, graph: result, error: null, loading: false })
      return true
    } catch {
      if (active.current === scope && request === sequence.current) {
        setState({ scope, graph: null, error: "Canvas is unavailable. Try refreshing the workspace.", loading: false })
      }
      return false
    }
  }, [scope, workspaceId])
  const reload = useCallback(() => {
    const current = refresher.current
    return current?.scope === scope ? current.run() : Promise.resolve(false)
  }, [scope])
  useEffect(() => {
    const sequenceRef = sequence
    const refreshRef = refresher
    active.current = scope
    const entry = { scope, run: createCoalescedRefresh(read) }
    refreshRef.current = entry
    return () => {
      if (active.current === scope) active.current = ""
      if (refreshRef.current === entry) refreshRef.current = null
      sequenceRef.current++
    }
  }, [scope, read])
  useEffect(() => { if (workspaceId) void reload() }, [reload, workspaceId, refreshSignal])
  const current = state.scope === scope ? state : null
  const entry: AuthorizedWorkspaceGraph | null = workspace && current?.graph
    ? { workspace, graph: current.graph, complete: true } : null
  return { entry, error: current?.error ?? null, loading: workspaceId ? current?.loading ?? true : false, reload }
}
