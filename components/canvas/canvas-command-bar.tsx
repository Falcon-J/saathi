"use client"

import { useEffect, useRef, useState } from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import type { Task } from "@/lib/task-contract"

export function CanvasCommandBar({ scopeName, tasks, selectedTask, canComplete, canCreate = true, busy, disabled, onOpenTask, onCreate, onComplete, onWorkspace, onList, followingAgent = false, onStopFollowing }: {
  scopeName: string
  tasks: readonly Task[]
  selectedTask: Task | null
  canComplete: boolean
  canCreate?: boolean
  busy: boolean
  disabled: boolean
  onOpenTask: (id: string) => void
  onCreate: () => void
  onComplete: () => void
  onWorkspace: () => void
  onList: () => void
  followingAgent?: boolean
  onStopFollowing?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
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
          {selectedTask && canComplete && !selectedTask.completed && selectedTask.status !== "done" && <CommandItem value={`complete ${selectedTask.title}`} disabled={disabled || busy} onSelect={() => run(onComplete)}>Complete {selectedTask.title}</CommandItem>}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tasks">{tasks.map(task => <CommandItem key={task.id} value={`${task.id} ${task.title} ${task.assigneeEmail ?? ""}`} disabled={disabled || busy} onSelect={() => run(() => onOpenTask(task.id))}>{task.title}</CommandItem>)}</CommandGroup>
      </CommandList>
      <CommandInput ref={input} asChild placeholder={busy ? "Saving…" : "Search tasks or commands"}
        value={query} onValueChange={value => { setQuery(value); setOpen(true) }} onFocus={() => setOpen(true)} disabled={disabled || busy}>
        {/* eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- cmdk supplies aria-controls through its supported Input asChild slot. */}
        <input role="combobox" aria-label="Search commands and tasks" aria-expanded={open} {...(!open ? { "aria-activedescendant": undefined } : {})} />
      </CommandInput>
    </Command>
  </section>
}
