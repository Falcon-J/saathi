"use client"

import { useEffect, useRef, useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { useCanvasSearch } from "./use-canvas-search"
import type { Task } from "@/lib/task-contract"

export function CanvasCommandBar({ scopeName, tasks, selectedTask, canComplete, canCreate = true, busy, disabled, onOpenTask, onCreate, onComplete, onWorkspace, onList, followingAgent = false, onStopFollowing, searchScope, searchRevision = "" }: {
  searchScope?: { resourceId?: string }
  searchRevision?: string
  scopeName: string
  tasks: readonly Task[]
  selectedTask: Task | null
  canComplete: boolean
  canCreate?: boolean
  busy: boolean
  disabled: boolean
  onOpenTask: (id: string, workspaceId?: string) => void
  onCreate: () => void
  onComplete: () => void
  onWorkspace: () => void
  onList: () => void
  followingAgent?: boolean
  onStopFollowing?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const remote = useCanvasSearch(query, Boolean(searchScope) && open && !disabled, searchScope?.resourceId, searchRevision)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); input.current?.focus() }
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", shortcut)
    return () => window.removeEventListener("keydown", shortcut)
  }, [])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false) }
    window.addEventListener("pointerdown", dismiss)
    return () => window.removeEventListener("pointerdown", dismiss)
  }, [])
  const matchesAction = (value: string) => !searchScope || value.includes(query.trim().toLowerCase())
  const run = (work: () => void) => { if (disabled || busy) return; setOpen(false); setQuery(""); work() }
  return <section ref={root} aria-label="Canvas commands" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-xl sm:inset-x-6 sm:bottom-5">
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><p role="status" className="truncate text-sm font-medium" aria-label="Command scope">{scopeName}</p><div className="flex shrink-0 items-center gap-1">{followingAgent && onStopFollowing && <Button size="sm" variant="ghost" onClick={onStopFollowing}>Stop following</Button>}<Button size="sm" variant="ghost" onClick={onList}>Task list</Button></div></div>
    <Command label="Search commands and tasks" shouldFilter={!searchScope} loop className="relative overflow-visible rounded-b-2xl"
      onKeyDownCapture={event => { if (!open && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setOpen(true) } else if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) setOpen(true) }}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>
      <CommandList hidden={!open} className="absolute inset-x-0 bottom-full mb-14 max-h-[min(50dvh,360px)] rounded-xl border border-border bg-popover shadow-xl">
        {!remote.loading && !remote.error && <CommandEmpty>{searchScope && query.trim().length < 2 ? "Type at least 2 characters to search." : "No matching commands or tasks."}</CommandEmpty>}
        {remote.loading && <p role="status" className="p-3 text-sm">Searching…</p>}
        {remote.error && <div role="alert" className="p-3 text-sm">{remote.error}<Button size="sm" variant="ghost" onClick={remote.retry}>Try again</Button></div>}
        <CommandGroup heading="Actions">
          {canCreate && matchesAction("create add new task") && <CommandItem value="create add new task" disabled={disabled || busy} onSelect={() => run(onCreate)}>Create task</CommandItem>}
          {matchesAction("open workspace") && <CommandItem value="open workspace" disabled={disabled || busy} onSelect={() => run(onWorkspace)}>Open workspace</CommandItem>}
          {selectedTask && matchesAction(`complete ${selectedTask.title.toLowerCase()}`) && canComplete && !selectedTask.completed && selectedTask.status !== "done" && <CommandItem value={`complete ${selectedTask.title}`} disabled={disabled || busy} onSelect={() => run(onComplete)}>Complete {selectedTask.title}</CommandItem>}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tasks">{(searchScope ? remote.items : tasks).map(task => <CommandItem key={task.id} value={`${task.id} ${task.title} ${("assigneeEmail" in task ? task.assigneeEmail : "") ?? ""}`} disabled={disabled || busy} onSelect={() => run(() => onOpenTask(task.id, task.workspaceId))}>{task.title}{"workspaceName" in task && <span className="ml-2 text-muted-foreground">{task.workspaceName}</span>}</CommandItem>)}</CommandGroup>
      </CommandList>
      <CommandInput ref={input} asChild placeholder={busy ? "Saving…" : "Search tasks or commands"}
        value={query} onValueChange={value => { setQuery(value); setOpen(true) }} onFocus={() => setOpen(true)} disabled={disabled || busy}>
        {/* eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- cmdk supplies aria-controls through its supported Input asChild slot. */}
        <input role="combobox" aria-label="Search commands and tasks" aria-expanded={open} {...(!open ? { "aria-activedescendant": undefined } : {})} />
      </CommandInput>
    </Command>
  </section>
}
