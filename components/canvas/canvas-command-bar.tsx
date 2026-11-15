"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import type { Task } from "@/lib/task-contract"

export function CanvasCommandBar({ scopeName, tasks, selectedTask, canComplete, canCreate = true, canEdit = false, canManage = false, busy, disabled, onOpenTask, onCreate, onComplete, onWorkspace, onList, onAsk, onImport, onNavigate, onTool, followingAgent = false, onStopFollowing }: {
  scopeName: string
  tasks: readonly Task[]
  selectedTask: Task | null
  canComplete: boolean
  canCreate?: boolean
  canEdit?: boolean
  canManage?: boolean
  busy: boolean
  disabled: boolean
  onOpenTask: (id: string) => void
  onCreate: () => void
  onComplete: () => void
  onWorkspace: () => void
  onList: () => void
  onAsk?: () => void
  onImport?: () => void
  onNavigate?: (path: "/archive" | "/connections") => void
  onTool?: (tool: "prerequisites" | "agents" | "team" | "activity" | "settings") => void
  followingAgent?: boolean
  onStopFollowing?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const matchingTasks = useMemo(() => {
    if (!open) return []
    const search = query.trim().toLocaleLowerCase()
    return tasks.filter(task => `${task.id} ${task.title} ${task.assigneeEmail ?? ""}`.toLocaleLowerCase().includes(search)).slice(0, 50)
  }, [tasks, query, open])
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
  const run = (work: () => void) => { if (disabled || busy) return; setOpen(false); setQuery(""); work() }
  return <section ref={root} aria-label="Canvas commands" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-xl sm:inset-x-6 sm:bottom-5">
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2"><p role="status" className="truncate text-sm font-medium" aria-label="Command scope">{scopeName}</p><div className="flex shrink-0 items-center gap-1">{followingAgent && onStopFollowing && <Button size="sm" variant="ghost" onClick={onStopFollowing}>Stop following</Button>}<Button size="sm" variant="ghost" onClick={onList}>Task list</Button></div></div>
    <Command label="Search commands and tasks" shouldFilter loop className="relative overflow-visible rounded-b-2xl"
      onKeyDownCapture={event => { if (!open && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setOpen(true) } else if (!open && ["ArrowDown", "ArrowUp"].includes(event.key)) setOpen(true) }}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }}>
      <CommandList hidden={!open} className="absolute inset-x-0 bottom-full mb-14 max-h-[min(50dvh,360px)] rounded-xl border border-border bg-popover shadow-xl">
        <CommandEmpty>No matching commands or tasks.</CommandEmpty>
        <CommandGroup heading="Actions">
          {canCreate && <CommandItem value="create add new task" disabled={disabled || busy} onSelect={() => run(onCreate)}>Create task</CommandItem>}
          <CommandItem value="open workspace" disabled={disabled || busy} onSelect={() => run(onWorkspace)}>Open workspace</CommandItem>
          {onAsk && <CommandItem value="ask saathi plan draft summarize attention" disabled={disabled || busy} onSelect={() => run(onAsk)}>Ask Saathi</CommandItem>}
          {onImport && <CommandItem value="import csv tasks" disabled={disabled || busy} onSelect={() => run(onImport)}>Import tasks</CommandItem>}
          {onTool && <>
            {canEdit && <CommandItem value="prerequisites dependencies ready waiting" disabled={disabled || busy} onSelect={() => run(() => onTool("prerequisites"))}>Prerequisites</CommandItem>}
            <CommandItem value="agent runs review evidence" disabled={disabled || busy} onSelect={() => run(() => onTool("agents"))}>Agent runs</CommandItem>
            <CommandItem value="team members invitations" disabled={disabled || busy} onSelect={() => run(() => onTool("team"))}>Team</CommandItem>
            <CommandItem value="history activity changes" disabled={disabled || busy} onSelect={() => run(() => onTool("activity"))}>History</CommandItem>
            {canManage && <CommandItem value="settings workspace archive delete" disabled={disabled || busy} onSelect={() => run(() => onTool("settings"))}>Settings</CommandItem>}
          </>}
          {onNavigate && <>
            <CommandItem value="archive archived workspaces history" onSelect={() => { if (!busy) { setOpen(false); onNavigate("/archive") } }}>Archive</CommandItem>
            <CommandItem value="connections mcp oauth agents" onSelect={() => { if (!busy) { setOpen(false); onNavigate("/connections") } }}>Connections</CommandItem>
          </>}
          {selectedTask && canComplete && !selectedTask.completed && selectedTask.status !== "done" && <CommandItem value={`complete ${selectedTask.title}`} disabled={disabled || busy} onSelect={() => run(onComplete)}>Complete {selectedTask.title}</CommandItem>}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tasks">{matchingTasks.map(task => <CommandItem key={task.id} value={`${task.id} ${task.title} ${task.assigneeEmail ?? ""}`} disabled={disabled || busy} onSelect={() => run(() => onOpenTask(task.id))}>{task.title}</CommandItem>)}</CommandGroup>
      </CommandList>
      <CommandInput ref={input} asChild placeholder={busy ? "Saving…" : "Search tasks or commands"}
        value={query} onValueChange={value => { setQuery(value); setOpen(true) }} onFocus={() => setOpen(true)} disabled={busy || (disabled && !onNavigate)}>
        {/* eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- cmdk supplies aria-controls through its supported Input asChild slot. */}
        <input role="combobox" aria-label="Search commands and tasks" aria-expanded={open} {...(!open ? { "aria-activedescendant": undefined } : {})} />
      </CommandInput>
    </Command>
  </section>
}
