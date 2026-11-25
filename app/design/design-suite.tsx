"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Plus, Trash2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { StatusChip, TASK_STATES } from "@/components/ui/status-chip"
import { Kbd } from "@/components/ui/kbd"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useNotifications } from "@/hooks/use-notifications"

const variants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const
const sizes = ["sm", "default", "lg"] as const
const tokens = [["Background", "--background"], ["Card", "--card"], ["Muted", "--muted"], ["Border", "--border"], ["Text", "--foreground"], ["Muted text", "--muted-foreground"], ["Primary", "--primary"], ["Accent", "--accent"], ["Ready", "--saathi-success"], ["Waiting", "--saathi-warning"], ["Review", "--saathi-review"], ["Danger", "--saathi-danger"]] as const

function Section({ id, title, rule, children }: { id: string; title: string; rule: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-border py-8">
      <div className="space-y-1"><h2 id={id} className="saathi-display text-xl">{title}</h2><p className="max-w-2xl text-sm text-muted-foreground">{rule}</p></div>
      {children}
    </section>
  )
}

export function DesignSuite() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [touched, setTouched] = useState(false)
  const { success } = useNotifications()
  useEffect(() => setMounted(true), [])
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex-1 space-y-2">
          <p className="saathi-label text-muted-foreground">Saathi design system</p>
          <h1 className="text-4xl">Components</h1>
          <p className="max-w-2xl text-muted-foreground">Every control in the app comes from this page. If a screen needs something that isn&apos;t here, add it here first.</p>
        </div>
        <Button variant="outline" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{mounted ? (resolvedTheme === "dark" ? "Light theme" : "Dark theme") : "Theme"}</Button>
      </header>

      <Section id="type" title="Type" rule="Pixel type for page titles and big numbers. Mono for labels, states and shortcuts. Inter for everything people read.">
        <div className="space-y-3">
          <p className="saathi-display text-4xl">Turn intent into progress</p>
          <p className="saathi-display text-2xl">Up next · 3 ready</p>
          <p className="saathi-label text-muted-foreground">Label · mono, uppercase</p>
          <p className="max-w-xl">Body text is Inter at 15 to 16 pixels, so descriptions, comments and review notes stay easy to read for a long time.</p>
        </div>
      </Section>

      <Section id="color" title="Colour" rule="Black, white and one violet. Violet marks the single main action and what's ready. Status colours always come with a word.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {tokens.map(([name, token]) => <div key={token} className="space-y-1.5"><div className="h-12 rounded-[var(--saathi-radius-control)] border border-border" style={{ background: `var(${token})` }} /><p className="text-sm font-medium">{name}</p><p className="font-mono text-xs text-muted-foreground">{token}</p></div>)}
        </div>
      </Section>

      <Section id="buttons" title="Buttons" rule="One violet button per view, for the main action. Everything else is outline, secondary or ghost. Red only removes data. Labels say the action: “Create task”, not “OK”.">
        <div className="space-y-4">
          {sizes.map(size => <div key={size} className="flex flex-wrap items-center gap-3"><span className="w-16 font-mono text-xs text-muted-foreground">{size}</span>{variants.map(variant => <Button key={variant} size={size} variant={variant}>{variant === "default" ? "Create task" : variant === "destructive" ? "Delete" : variant === "link" ? "View history" : variant[0].toUpperCase() + variant.slice(1)}</Button>)}</div>)}
          <div className="flex flex-wrap items-center gap-3"><span className="w-16 font-mono text-xs text-muted-foreground">states</span>
            <Button><Plus />New task</Button>
            <Button variant="outline">Next <ArrowRight /></Button>
            <Button disabled>Disabled</Button>
            <Button loading={saving} onClick={() => { setSaving(true); setTimeout(() => setSaving(false), 1500) }}>{saving ? "Saving…" : "Save (click me)"}</Button>
            <Button size="icon" variant="ghost" aria-label="Delete task"><Trash2 /></Button>
          </div>
        </div>
      </Section>

      <Section id="inputs" title="Inputs" rule="Every input has a visible label. Help sits under it. An error replaces the help, says how to fix it, and is announced.">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="ds-title" label="Task title" required hint="Start with a verb, like “Draft the API”." error={touched && !title.trim() ? "Add a title so people know what the task is." : undefined}>
            <Input id="ds-title" value={title} onChange={event => setTitle(event.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && !title.trim()} aria-describedby={touched && !title.trim() ? "ds-title-error" : "ds-title-hint"} placeholder="Draft the API" />
          </Field>
          <Field id="ds-notes" label="Notes" hint="Optional. Agents read this too.">
            <Textarea id="ds-notes" aria-describedby="ds-notes-hint" placeholder="What does done look like?" />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm"><Checkbox defaultChecked /> Let agents claim this task</label>
        </div>
      </Section>

      <Section id="status" title="Task states" rule="The only way to show a task's state. Each has a mark, a word and a colour, so it reads in greyscale too.">
        <div className="flex flex-wrap gap-2">{TASK_STATES.map(state => <StatusChip key={state} state={state} />)}</div>
      </Section>

      <Section id="cards" title="Task card" rule="The same card on the Canvas, in the List and in Up next. Title first, then state, then who has it.">
        <div className="grid gap-3 sm:grid-cols-3">
          {([["Draft the API", "ready", "Unblocks 2 · High"], ["Build export", "in_progress", "Agent B · lease 4m"], ["Ship to customers", "waiting", "Waiting on 2"]] as const).map(([name, state, meta]) => (
            <article key={name} className="space-y-2 rounded-[var(--saathi-radius-card)] border border-border bg-card p-3 shadow-[var(--saathi-shadow-card)] data-[ready=true]:border-primary" data-ready={state === "ready"}>
              <h3 className="font-semibold">{name}</h3><StatusChip state={state} /><p className="font-mono text-xs text-muted-foreground">{meta}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="feedback" title="Dialogs and messages" rule="Confirm only what can't be undone, inside the page, naming exactly what goes. Everything else just happens and shows a short message.">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild><Button variant="destructive">Delete workspace</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Delete “Invoice export” for good?</DialogTitle><DialogDescription>Its 12 tasks, comments and agent runs are removed. This can&apos;t be undone.</DialogDescription></DialogHeader>
              <DialogFooter><DialogClose asChild><Button variant="outline">Keep it</Button></DialogClose><DialogClose asChild><Button variant="destructive">Delete for good</Button></DialogClose></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => success("Task created", "“Draft the API” is in Up next.")}>Show a message</Button>
        </div>
      </Section>

      <Section id="empty" title="Empty and loading" rule="An empty view says why it's empty and offers the one action that fills it. Loading keeps the layout still.">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState title="Nothing is ready" description="Every task is waiting on something. Finish a prerequisite or add a new task." action={<Button><Plus />New task</Button>} />
          <div className="space-y-3 rounded-[var(--saathi-radius-container)] border border-border p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-16 w-full" /></div>
        </div>
      </Section>

      <Section id="keys" title="Shortcuts" rule="Every main action has a key. Shortcuts are shown next to the action, never only in help.">
        <div className="flex flex-wrap gap-4 text-sm"><span className="flex items-center gap-2"><Kbd>N</Kbd> New task</span><span className="flex items-center gap-2"><Kbd>⌘</Kbd><Kbd>K</Kbd> Search and commands</span><span className="flex items-center gap-2"><Kbd>V</Kbd> Switch Canvas and List</span></div>
      </Section>
    </main>
  )
}
