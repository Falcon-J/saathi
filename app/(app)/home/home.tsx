"use client"
// Home from home-v1 and the task view from task-v1: what needs you on top, the open task beside the list or full width.
// Approve, Stop, Send back and Answer wait 5 s so Undo can cancel them; leaving the page sends them at once (keepalive).
// Any event in the workspace nudges a re-read, so other tabs and agents show up live.
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { decide, markVisit, type Decision } from "../actions"
import { NewTask } from "./new-task"
import { useLive } from "../live"
import s from "../app.module.css"

type Group = "you" | "work" | "wait" | "done"
type Near = { ref: string; title: string; group: Group; last?: boolean }
export type Row = {
  ref: string; title: string; group: Group; status: string; agent: string | null
  steps_done: number; steps_total: number; waits_on: string | null; done_at: string | null; updated_at: string
}
export type HomeData = {
  tasks: Row[]; agents: { id: string; name: string }[]
  since: { at: string; done: number; unlocked: number }
}
type Event = { at: string; kind: string; data: Record<string, string | number>; agent: string | null; by: string | null; me: boolean }
export type TaskView = Row & {
  done_when: string | null; details: string | null; scope: string | null; priority: string; created_at: string
  steps: string[]; approved_by: string | null
  review: { summary: string; at: string; scope_ok: boolean | null; passed: number; total: number
            changes: { files?: number; added?: number; removed?: number } | null } | null
  question: { text: string; options: string[]; at: string } | null
  history: Event[]; before: Near | null; after: Near | null
}

const SECTIONS: [Group, string][] = [["you", "Needs you"], ["work", "Working"], ["wait", "Waiting"], ["done", "Done today"]]
const LABEL: Record<Group, string> = { you: "needs you", work: "working", wait: "waiting", done: "done" }
const CLS: Record<Group, string> = { you: "c-you", work: "c-work", wait: "c-bl", done: "c-ok" }
type Moved = Record<string, { from: Group; to: Group; at: string }>
const without = (m: Moved, ref: string) => { const c = { ...m }; delete c[ref]; return c }
const cap = (t: string) => t[0].toUpperCase() + t.slice(1)
const time = (at: string | null) => at ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""
function ago(at: string) {
  const min = Math.round((Date.now() - Date.parse(at)) / 60000)
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`
}
// "6 PM yesterday", "9:30 AM", or "Mon 6 PM".
function since(at: string) {
  const d = new Date(at), days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 864e5)
  const t = d.toLocaleTimeString([], { hour: "numeric", ...(d.getMinutes() ? { minute: "2-digit" } : {}) })
  return days === 0 ? t : days === 1 ? `${t} yesterday` : `${d.toLocaleDateString([], { weekday: "short" })} ${t}`
}
// One history line and its dot colour.
function line(e: Event): [string, string] {
  const who = e.me ? "You" : e.by ?? "Someone", d = e.data
  switch (e.kind) {
    case "task.created": return [`${who} created it`, "me"]
    case "task.linked": return [`Waits on ${d.waits_on}`, "wait"]
    case "task.unlinked": return [`No longer waits on ${d.waits_on}`, "wait"]
    case "task.claimed": return [`${e.agent ?? "An agent"} picked it up`, "work"]
    case "task.question": return [`${e.agent ?? "The agent"} asked a question`, "you"]
    case "task.answered": return [`${who} answered: ${d.answer}`, "me"]
    case "task.submitted": return [`Finished. ${d.passed} of ${d.total} checks pass`, "ok"]
    case "task.approved": return [`${who} approved it`, "ok"]
    case "task.sent_back": return [`${who} sent it back: ${d.note}`, "me"]
    case "task.unlocked": return [`Unlocked by ${d.by}`, "work"]
    case "task.silent": return [`${e.agent ?? "The agent"} went quiet`, "wait"]
    case "task.released": return [d.reason === "stopped" ? `${who} stopped it` : d.reason === "lease" ? "Its lease ended" : d.reason === "revoked" ? "Its key was revoked" : `${e.agent ?? "The agent"} let it go`, "wait"]
    default: return [e.kind, ""]
  }
}


function Glyph({ g }: { g: Group | "next" }) {
  const r = { x: 1.5, y: 1.5, width: 11, height: 11, rx: 3 }
  return (
    <svg className={s.g} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {g === "you" && <rect {...r} fill="var(--primary-text)" />}
      {g === "work" && <><rect {...r} fill="none" stroke="var(--ink)" strokeWidth="1.5" /><rect x="5" y="5" width="4" height="4" rx="1" fill="var(--ink)" /></>}
      {g === "wait" && <rect {...r} fill="none" stroke="var(--info-text)" strokeWidth="1.5" strokeDasharray="2.5 2" />}
      {g === "next" && <rect {...r} fill="none" stroke="var(--border-strong)" strokeWidth="1.5" />}
      {g === "done" && <><rect {...r} fill="var(--success)" /><path d="m4.5 7 1.8 1.8L9.6 5.4" fill="none" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
    </svg>
  )
}
const Avatar = ({ name }: { name: string | null }) =>
  name ? <span className={s.av} title={name} aria-hidden="true">{name[0]}</span> : <span className={`${s.av} ${s.none}`} title="No agent" aria-hidden="true" />

function Meta({ t }: { t: Row }) {
  if (t.group === "you") return <span className={s["c-you"]}>{t.status === "question" ? "Question" : "Review"}</span>
  if (t.group === "work") return t.steps_total ? (
    <><span className={s.bar} aria-hidden="true">{Array.from({ length: t.steps_total }, (_, i) =>
      <i key={i} className={i < t.steps_done ? s.on : i === t.steps_done ? s.now : undefined} />)}</span>
      <span className={s["c-work"]}>{Math.min(t.steps_done + 1, t.steps_total)} of {t.steps_total}</span></>
  ) : <span className={s["c-work"]}>Working</span>
  if (t.group === "wait") return <span className={s["c-bl"]}>{t.waits_on ? `Waits on ${t.waits_on}` : t.agent ? "Ready" : "No agent free"}</span>
  return <span className={s["c-fa"]} suppressHydrationWarning>{time(t.done_at)}</span>
}

const Node = ({ l }: { l: Near }) => <span className={`${s.node} ${s[l.group === "done" ? "ok" : l.group]}`}><Glyph g={l.group} />{l.ref}</span>
function Chain({ label, a, b, caption }: { label: string; a: Near; b: Near; caption: string }) {
  return (
    <div className={s.chain}>
      <p className={s["chain-l"]}>{label}</p>
      <div className={s.links}><Node l={a} /><span className={s.wire} /><Node l={{ ...b, group: b.group === "done" ? "done" : "wait" }} /></div>
      <p className={s["next-t"]}>{caption}</p>
    </div>
  )
}

export function Home({ ws, data, task, at, full = false }: { ws: string; data: HomeData; task: TaskView | null; at: string; full?: boolean }) {
  const router = useRouter()
  const [moved, setMoved] = useState<Moved>({})
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [draft, setDraft] = useState<{ ref?: string; note: string | null; reply: string }>({ note: null, reply: "" })
  const [toast, setToast] = useState<{ text: string; undo: boolean; open?: string } | null>(null)
  const [sinceSeen, setSinceSeen] = useState<string | null>(null)
  const pending = useRef<{ ref: string; d: Decision; timer: number; text: string } | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const { offline, retryIn, retry } = useLive(ws)

  // A decision moves its row at once. It holds only while the server row is the one we decided on:
  // once the task changes (saved, or moved on by its agent), the server's group wins.
  const held = (t: Row) => moved[t.ref]?.at === t.updated_at
  const rows = SECTIONS.flatMap(([g]) => data.tasks.map(t => ({ ...t, group: held(t) ? moved[t.ref].to : t.group }))
                                                 .filter(t => t.group === g))
  // The send-back note and a typed answer belong to the open task.
  const note = draft.ref === task?.ref ? draft.note : null
  const reply = draft.ref === task?.ref ? draft.reply : ""
  const setNote = (v: string | null) => setDraft({ ref: task?.ref, note: v, reply })
  const setReply = (v: string) => setDraft({ ref: task?.ref, note, reply: v })
  const visible = rows.filter((t, i, all) => t.group !== "done" || showAll || all.findIndex(x => x.group === "done") + 2 > i)
  const select = useCallback((ref: string, show = true) => {
    router.replace(full ? `/tasks/${encodeURIComponent(ref)}` : `/home?task=${encodeURIComponent(ref)}`, { scroll: false })
    if (show) setOpen(true)
  }, [router, full])
  const home = useCallback(() => router.push(task ? `/home?task=${encodeURIComponent(task.ref)}` : "/home"), [router, task])

  const send = useCallback(async () => {
    const p = pending.current
    if (!p) return
    pending.current = null
    clearTimeout(p.timer)
    const r = await decide(ws, p.ref, p.d).catch(() => ({ ok: false, message: undefined }))
    if (!r.ok) {
      setMoved(m => without(m, p.ref))
      // Keep the Undo of a decision still waiting to be sent.
      const err = r.message ?? "Couldn't save that. Try again."
      const still = pending.current as typeof p | null // a later decision may have been queued while this one saved
      setToast(still ? { text: `${err} ${still.text}`, undo: true } : { text: err, undo: false })
    }
  }, [ws])

  useEffect(() => {
    // A normal request is cancelled as the page unloads, so send with keepalive to the decide route.
    const flush = () => {
      const p = pending.current
      if (!p) return
      pending.current = null
      clearTimeout(p.timer)
      void fetch("/home/decide", { method: "POST", keepalive: true, headers: { "content-type": "application/json" },
                                   body: JSON.stringify({ ws, task: p.ref, d: p.d }) })
    }
    addEventListener("pagehide", flush)
    return () => removeEventListener("pagehide", flush)
  }, [ws])
  useEffect(() => {
    if (!toast || pending.current) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])


  const act = (d: Decision) => {
    if (!task || offline) return
    if (pending.current) void send()
    const group: Group = d.kind === "approve" ? "done" : d.kind === "answer" ? "work" : "wait"
    setMoved(m => ({ ...m, [task.ref]: { from: task.group, to: group, at: task.updated_at } }))
    const next = !full && rows.find(t => t.group === "you" && t.ref !== task.ref)
    if (next) select(next.ref, open); else if (!full) setOpen(false)
    const done = { approve: "Approved", stop: "Stopped", send_back: "Sent back", answer: "Answered" }[d.kind]
    const unlocks = d.kind === "approve" && task.after?.group === "wait" && task.after.last ? ` ${task.after.ref} unlocked.` : ""
    const text = `${done} ${task.ref}.${unlocks}`
    pending.current = { ref: task.ref, d, text, timer: window.setTimeout(() => { setToast(null); void send() }, 5000) }
    setToast({ text, undo: true })
  }
  const undo = () => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    setMoved(m => without(m, p.ref))
    setToast(null)
    select(p.ref, open)
  }
  const sendBack = () => {
    if (note === null) { setNote(""); requestAnimationFrame(() => noteRef.current?.focus()); return }
    if (!note.trim()) { noteRef.current?.focus(); return }
    act({ kind: "send_back", note: note.trim() })
  }
  const decided = !!task && held(task)
  const reviewing = task && task.status === "review" && !decided
  const stoppable = task && ["working", "question"].includes(task.status) && !decided
  const caughtUp = () => { setSinceSeen(data.since.at); void markVisit(ws) }
  const showSince = !full && sinceSeen !== data.since.at && data.since.done + data.since.unlocked > 0

  const move = (step: number) => {
    const i = visible.findIndex(t => t.ref === task?.ref)
    const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + step))]
    if (next) select(next.ref, open)
  }
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => { keys.current = e => {
    if (dialog.current?.open) return
    const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
    if (typing || e.metaKey || e.ctrlKey || e.altKey) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return }
    const k = e.key.toLowerCase()
    if (k === "j" || k === "arrowdown") { e.preventDefault(); move(1) }
    else if (k === "k" || k === "arrowup") { e.preventDefault(); move(-1) }
    else if (k === "a" && reviewing) act({ kind: "approve" })
    else if (k === "s" && reviewing) { e.preventDefault(); sendBack() }
    else if (k === "c") { e.preventDefault(); dialog.current?.showModal() }
    else if (k === "escape") { if (full) home(); else setOpen(false) }
  } })
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e)
    addEventListener("keydown", on)
    return () => removeEventListener("keydown", on)
  }, [])

  const needsYou = rows.some(t => t.group === "you")
  const met = task && (task.group === "done" || task.status === "review")
  const side = task && (
    <dl className={s.props}>
      <dt>Status</dt><dd className={s[CLS[task.group]]}><Glyph g={task.group} />{cap(LABEL[task.group])}</dd>
      <dt>Agent</dt><dd><Avatar name={task.agent} />{task.agent ?? "Unassigned"}</dd>
      <dt>Priority</dt><dd>{task.priority === "none" ? <span className={s["c-fa"]}>No priority</span> : cap(task.priority)}</dd>
      <dt>Waits on</dt><dd>{task.before ? <Node l={task.before} /> : <span className={s["c-fa"]}>Nothing</span>}</dd>
      <dt>Unlocks</dt><dd>{task.after ? <Node l={task.after} /> : <span className={s["c-fa"]}>Nothing</span>}</dd>
      {task.scope && <><dt>Scope</dt><dd className={s.mono}>{task.scope}</dd></>}
      <dt>Created</dt><dd className={`${s.mono} ${s["c-fa"]}`} suppressHydrationWarning>{since(task.created_at)}</dd>
    </dl>
  )
  const offBanner = offline && (
    <div className={s.off} role="status">
      <p suppressHydrationWarning>Can&apos;t reach Saathi. Showing what you had at {time(at)}.</p>
      <span className={s.mono}>Trying again in {retryIn} s</span>
      <button className={`${s.btn} ${s["btn-line"]}`} type="button" onClick={retry}>Retry now</button>
    </div>
  )
  return (
    <>
      <header className={s.tb}>
        {full && task
          ? <div className={s.crumb}><button type="button" onClick={home}>Home</button><span className={s.mono}>/ {task.ref}</span></div>
          : <h1>Home</h1>}
        <button className={`${s.btn} ${s["btn-line"]}`} type="button" onClick={() => dialog.current?.showModal()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>New task</span><kbd>C</kbd>
        </button>
      </header>
      <div className={`${s.split} ${full ? s.full : ""}`}>
        <div className={s.list}>
          <div className={s.wrap}>
            {!full && offBanner}
            {showSince && !offline && (
              <div className={s.since}>
                <p suppressHydrationWarning><b>Since {since(data.since.at)}:</b> {data.since.done} done, {data.since.unlocked} unlocked.</p>
                <button className={`${s.btn} ${s["btn-line"]}`} type="button" onClick={() => { caughtUp(); const id = rows.find(t => t.group === "you")?.ref; if (id) select(id) }}>Catch up</button>
                <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Dismiss" onClick={caughtUp}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
              </div>
            )}
            {!needsYou && (
              <div className={s.clear} role="status">
                <span className={s.big} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                <div><h2>All clear</h2><p>Nothing needs you. We&apos;ll tell you when an agent finishes.</p></div>
              </div>
            )}
            {SECTIONS.map(([g, name]) => {
              const all = rows.filter(t => t.group === g)
              const shown = visible.filter(t => t.group === g)
              if (!all.length) return null
              return (
                <section key={g} aria-labelledby={`h-${g}`}>
                  <h2 className={`${s.sec} ${g === "you" ? s.you : ""}`} id={`h-${g}`}>{name} <span className={s.mono}>{all.length}</span></h2>
                  <ul className={s.rows}>
                    {shown.map(t => (
                      <li key={t.ref}>
                        <button className={s.row} type="button" aria-current={t.ref === task?.ref || undefined}
                                aria-label={`${t.ref}, ${t.title}, ${LABEL[t.group]}`} onClick={() => select(t.ref)}>
                          <Glyph g={t.group} /><span className={s.id}>{t.ref}</span><span className={s.t}>{t.title}</span>
                          <span className={s.m}><Meta t={t} /></span><Avatar name={t.agent} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {all.length > shown.length && <button className={s.more} type="button" onClick={() => setShowAll(true)}>Show {all.length - shown.length} more</button>}
                </section>
              )
            })}
            <div className={s.keys} aria-hidden="true"><span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>A</kbd> approve</span><span><kbd>S</kbd> send back</span><span><kbd>C</kbd> new task</span><span><kbd>Esc</kbd> close</span></div>
          </div>
        </div>

        <aside className={`${s.pane} ${open ? s.open : ""}`} aria-label="Task detail">
          <div className={s["p-hd"]}>
            <span className={s.mono}>{task?.ref}</span>
            {!full && task && <Link className={`${s.btn} ${s["btn-ico"]}`} href={`/tasks/${encodeURIComponent(task.ref)}`} aria-label="Open full page" title="Open full page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></Link>}
            <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Previous task" onClick={() => move(-1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg></button>
            <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Next task" onClick={() => move(1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
            <button className={`${s.btn} ${s["btn-ico"]} ${s.x}`} type="button" aria-label="Close" onClick={() => full ? home() : setOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
          </div>
          <div className={s["p-bd"]} aria-live="polite">
            {!task ? <p className={s["p-none"]}>Pick a task to see it here.</p> : <>
              <div className={s.main}>
                {full && offBanner}
                <h2>{task.title}</h2>
                <p className={s.tags}>
                  <span className={s[CLS[task.group]]}><Glyph g={task.group} />{cap(LABEL[task.group])}</span>
                  <span className={s.ag}><Avatar name={task.agent} />{task.agent ?? "Unassigned"}</span>
                </p>
                {task.done_when && (
                  <div className={`${s.dw} ${met ? s.met : ""}`}>
                    {met ? <Glyph g="done" /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>}
                    <div><b>{met ? "Done when · met" : "Done when"}</b>{task.done_when}</div>
                  </div>
                )}
                {task.details && <p className={s.det}>{task.details}</p>}
                {task.review && <>
                  <p className={s.who}><b>{task.agent}</b> finished · <span suppressHydrationWarning>{ago(task.review.at)}</span></p>
                  <p className={s.say}>{task.review.summary}</p>
                  <ul className={s.proof}>
                    <li><Glyph g={task.review.passed === task.review.total ? "done" : "wait"} /><span>Checks passed</span><span className={s.mono}>{task.review.passed} of {task.review.total}</span></li>
                    {task.review.changes?.files != null && <li><Glyph g="work" /><span>{task.review.changes.files} files changed</span><span className={s.mono}><span className={s.add}>+{task.review.changes.added ?? 0}</span> −{task.review.changes.removed ?? 0}</span></li>}
                    {task.review.scope_ok && <li><Glyph g="done" /><span>Stayed in scope</span><span className={s.mono}>{task.scope}</span></li>}
                  </ul>
                  {task.after && <Chain label="Approve to unlock" a={{ ...task, group: "you" }} b={task.after} caption={task.after.title} />}
                  {note !== null && (
                    <form className={s.note} onSubmit={e => { e.preventDefault(); sendBack() }}>
                      <label htmlFor="note">What should change?</label>
                      <textarea id="note" ref={noteRef} value={note} maxLength={1000} placeholder="Tell the agent in a sentence" onChange={e => setNote(e.target.value)} />
                      <div className={s.quick}>
                        {["Add tests", "Make it smaller", ...(task.scope ? [`Stay in ${task.scope}`] : [])].map(q =>
                          <button key={q} type="button" onClick={() => { setNote(q); noteRef.current?.focus() }}>{q}</button>)}
                      </div>
                    </form>
                  )}
                </>}
                {task.question && !decided && <>
                  <p className={s.who}><b>{task.agent}</b> asked · <span suppressHydrationWarning>{ago(task.question.at)}</span></p>
                  <p className={s.say}>{task.question.text}</p>
                  {task.question.options.length > 0 && <div className={s.opts}>{task.question.options.map(o =>
                    <button key={o} className={`${s.btn} ${s["btn-line"]} ${s.mono}`} type="button" disabled={offline} onClick={() => act({ kind: "answer", answer: o })}>{o}</button>)}</div>}
                  <form className={s.note} onSubmit={e => { e.preventDefault(); if (reply.trim()) act({ kind: "answer", answer: reply.trim() }) }}>
                    <label htmlFor="reply">{task.question.options.length ? "Or answer in your words" : "Your answer"}</label>
                    <div className={s["say-to"]}><input className={s.in} id="reply" value={reply} maxLength={1000} autoComplete="off" onChange={e => setReply(e.target.value)} />
                      <button className={`${s.btn} ${s["btn-line"]}`} type="submit" disabled={offline}>Send</button></div>
                  </form>
                  <p className={s.calm}>Answer and the agent carries on.</p>
                </>}
                {task.group === "work" && <>
                  {task.steps.length > 0 && <>
                    <p className={s.h3}>Step {Math.min(task.steps_done + 1, task.steps.length)} of {task.steps.length}</p>
                    <ol className={s.steps}>{task.steps.map((p, i) => {
                      const c = i < task.steps_done ? "ok" : i === task.steps_done ? "now" : ""
                      return <li key={i} className={c ? s[c] : undefined}><Glyph g={c === "ok" ? "done" : c === "now" ? "work" : "next"} /><span>{p}</span>{c === "now" && <span className={s.mono}>now</span>}</li>
                    })}</ol>
                  </>}
                  <p className={s.calm}>Nothing to do yet. It shows up under Needs you when it&apos;s ready.</p>
                </>}
                {task.group === "wait" && (task.before
                  ? <Chain label="Starts when this is approved" a={task.before} b={task} caption={task.before.title} />
                  : <p className={s.calm}>Ready to start. The next free agent picks it up.</p>)}
                {task.group === "done" && <p className={s.calm} suppressHydrationWarning>Approved by {task.approved_by ?? "you"} at {time(task.done_at)}.</p>}
                <p className={s.h3}>History</p>
                <ol className={s.hist}>{task.history.map((e, i) => { const [text, c] = line(e)
                  return <li key={i} className={c ? s[c] : undefined}><span className={s.mono} suppressHydrationWarning>{since(e.at)}</span><span>{text}</span></li> })}</ol>
              </div>
              <div className={s.side}>{full ? side : <><p className={s.h3}>Details</p>{side}</>}</div>
            </>}
          </div>
          {(reviewing || stoppable) && (
            <div className={s["p-ft"]}>
              {reviewing ? <>
                <button className={`${s.btn} ${note === null ? s["btn-ghost"] : s["btn-line"]}`} type="button" disabled={offline} onClick={sendBack}>{note === null ? <>Send back <kbd>S</kbd></> : "Send to agent"}</button>
                <button className={`${s.btn} ${s["btn-acc"]}`} type="button" disabled={offline} onClick={() => act({ kind: "approve" })}>Approve <kbd>A</kbd></button>
              </> : <button className={`${s.btn} ${s["btn-ghost"]}`} type="button" disabled={offline} onClick={() => act({ kind: "stop" })}>Stop agent</button>}
            </div>
          )}
        </aside>

        <div className={`${s.toast} ${toast ? s.on : ""}`} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          <span>{toast?.text}</span>
          {toast?.open && <button className={s.btn} type="button" onClick={() => { const r = toast.open!; setToast(null); select(r) }}>Open</button>}
          {toast?.undo && <button className={s.btn} type="button" onClick={undo}>Undo</button>}
        </div>
      </div>
      <NewTask ref={dialog} ws={ws} offline={offline} agents={data.agents}
               open={data.tasks.filter(t => t.group !== "done")}
               onCreated={(ref, waitsOn) => {
                 const text = `${ref} created.${waitsOn ? ` It waits on ${waitsOn}.` : ""}`
                 // A decision still in its undo window keeps its Undo.
                 setToast(pending.current ? { text: `${pending.current.text} ${text}`, undo: true, open: ref } : { text, undo: false, open: ref })
               }} />
    </>
  )
}
