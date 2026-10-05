"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { getTasksPage, getWorkspaceTaskAggregates } from "@/app/tasks/actions"
import type { Task } from "@/lib/task-contract"
import type { TaskPageInput, TaskAggregates } from "@/lib/task-page"

export function useTaskBoard(workspaceId: string, refreshSignal: number) {
  const [filters, setFilters] = useState<TaskPageInput>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [aggregates, setAggregates] = useState<TaskAggregates | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const version = useRef(0)
  const mounted = useRef(true)
  const morePending = useRef(false)
  const scope = useRef({ workspaceId, filters })
  useLayoutEffect(() => {
    scope.current = { workspaceId, filters }
    version.current++
  }, [workspaceId, filters])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const reload = useCallback(async () => {
    const selection = scope.current
    if (selection.filters !== filters || selection.workspaceId !== workspaceId || !mounted.current) return false
    const request = ++version.current
    const isCurrent = () => mounted.current && version.current === request && scope.current === selection
    setLoading(true)
    setLoadingMore(false)
    morePending.current = false
    setError(null)
    try {
      const [page, totals] = await Promise.all([
        getTasksPage(workspaceId, { ...filters, limit: 50 }), getWorkspaceTaskAggregates(workspaceId),
      ])
      if (!isCurrent()) return false
      if ("error" in page || "error" in totals) {
        setError(("error" in page ? page.error : undefined) || ("error" in totals ? totals.error : undefined) || "Unable to load tasks. Try again.")
        return false
      }
      setTasks(page.tasks)
      setNextCursor(page.nextCursor ?? null)
      setAggregates(totals.aggregates)
      return true
    } catch {
      if (isCurrent()) setError("Unable to load tasks. Try again.")
      return false
    } finally { if (isCurrent()) setLoading(false) }
  }, [workspaceId, filters])

  useEffect(() => { void reload() }, [reload, refreshSignal])

  const changeFilters = useCallback((changes: TaskPageInput) => {
    version.current++
    morePending.current = false
    setLoadingMore(false)
    setLoading(true)
    setTasks([])
    setNextCursor(null)
    setFilters(current => ({ ...current, ...changes, cursor: undefined }))
  }, [])

  const loadMore = async () => {
    if (!nextCursor || loading || morePending.current || scope.current.filters !== filters || scope.current.workspaceId !== workspaceId || !mounted.current) return
    morePending.current = true
    setLoadingMore(true)
    setError(null)
    const request = version.current, selection = scope.current
    const isCurrent = () => mounted.current && version.current === request && scope.current === selection
    try {
      const page = await getTasksPage(workspaceId, { ...filters, cursor: nextCursor, limit: 50 })
      if (!isCurrent()) return
      if ("error" in page) { setError(page.error || "Unable to load more tasks."); return }
      setTasks(current => {
        const ids = new Set(current.map(task => task.id))
        return [...current, ...page.tasks!.filter(task => !ids.has(task.id))]
      })
      setNextCursor(page.nextCursor ?? null)
    } catch { if (isCurrent()) setError("Unable to load more tasks. Try again.") }
    finally { if (isCurrent()) { morePending.current = false; setLoadingMore(false) } }
  }
  return { tasks, aggregates, filters, changeFilters, nextCursor, loading, loadingMore, error, reload, loadMore }
}
