"use client"
// Home from home-v1: what needs you on top, the open task beside the list.
// Approve, Send back and Answer wait 5 s so Undo can cancel them; leaving the page sends them at once.
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { decide, type Decision } from "../actions"
import s from "../app.module.css"

type Group = "you" | "work" | "wait" | "done"
type Link = { ref: string; title: string; group: Group }
export type Row = {
  ref: string; title: string; group: Group; status: string; agent: string | null
  steps_done: number; steps_total: number; waits_on: string | null; done_at: string | null; updated_at: string
}
export type TaskView = Row & {
  done_when: string | null; scope: string | null; step_now: string | null; approved_by: string | null
  review: { summary: string; at: string; scope_ok: boolean | null; passed: number; total: number
            changes: { files?: number; added?: number; removed?: number } | null } | null
  question: { text: string; options: string[]; at: string } | null
  log: { at: string; text: string | null }[]
  before: Link | null; after: Link | null
}

const SECTIONS: [Group, string][] = [["you", "Needs you"], ["work", "Working"], ["wait", "Waiting"], ["done", "Done today"]]
const LABEL: Record<Group, string> = { you: "needs you", work: "working", wait: "waiting", done: "done" }
type Moved = Record<string, { from: Group; to: Group }>
const without = (m: Moved, ref: string) => { const c = { ...m }; delete c[ref]; return c }
const time = (at: string | null) => at ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""
function ago(at: string) {
  const min = Math.round((Date.now() - Date.parse(at)) / 60000)
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`
}

function Glyph({ g }: { g: Group }) {
  const r = { x: 1.5, y: 1.5, width: 11, height: 11, rx: 3 }
  return (
    <svg className={s.g} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {g === "you" && <rect {...r} fill="var(--primary-text)" />}
      {g === "work" && <><rect {...r} fill="none" stroke="var(--ink)" strokeWidth="1.5" /><rect x="5" y="5" width="4" height="4" rx="1" fill="var(--ink)" /></>}
      {g === "wait" && <rect {...r} fill="none" stroke="var(--info-text)" strokeWidth="1.5" strokeDasharray="2.5 2" />}
      {g === "done" && <><rect {...r} fill="var(--success)" /><path d="m4.5 7 1.8 1.8L9.6 5.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>}
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

function Chain({ label, a, b, caption }: { label: string; a: Link; b: Link; caption: string }) {
  return (
    <div className={s.chain}>
      <p className={s["chain-l"]}>{label}</p>
      <div className={s.links}>
        <span className={`${s.node} ${s[a.group === "done" ? "ok" : a.group]}`}><Glyph g={a.group} />{a.ref}</span>
        <span className={s.wire} />
        <span className={`${s.node} ${s.wait}`}><Glyph g="wait" />{b.ref}</span>
      </div>
      <p className={s["next-t"]}>{caption}</p>
    </div>
  )
}

export function Home({ ws, tasks, task }: { ws: string; tasks: Row[]; task: TaskView | null }) {
  const router = useRouter()
  const [moved, setMoved] = useState<Moved>({})
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [draft, setDraft] = useState<{ ref?: string; note: string | null; reply: string }>({ note: null, reply: "" })
  const [toast, setToast] = useState<{ text: string; undo: boolean } | null>(null)
  const pending = useRef<{ ref: string; d: Decision; timer: number } | null>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // A decision moves its row at once, until the server's next read shows the move itself.
  const rows = SECTIONS.flatMap(([g]) => tasks.map(t => ({ ...t, group: moved[t.ref]?.from === t.group ? moved[t.ref].to : t.group }))
                                            .filter(t => t.group === g))
  // The send-back note and a typed answer belong to the open task.
  const note = draft.ref === task?.ref ? draft.note : null
  const reply = draft.ref === task?.ref ? draft.reply : ""
  const setNote = (v: string | null) => setDraft({ ref: task?.ref, note: v, reply })
  const setReply = (v: string) => setDraft({ ref: task?.ref, note, reply: v })
  const visible = rows.filter((t, i, all) => t.group !== "done" || showAll || all.findIndex(x => x.group === "done") + 2 > i)
  const select = useCallback((ref: string, show = true) => {
    router.replace(`/home?task=${encodeURIComponent(ref)}`, { scroll: false })
    if (show) setOpen(true)
  }, [router])

  const send = useCallback(async () => {
    const p = pending.current
    if (!p) return
    pending.current = null
    clearTimeout(p.timer)
    const r = await decide(ws, p.ref, p.d)
    if (!r.ok) {
      setMoved(m => without(m, p.ref))
      setToast({ text: r.message ?? "Couldn't save that. Try again.", undo: false })
    }
  }, [ws])

  useEffect(() => {
    const flush = () => { if (pending.current) void send() }
    addEventListener("pagehide", flush)
    return () => removeEventListener("pagehide", flush)
  }, [send])
  useEffect(() => {
    if (!toast || pending.current) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const act = (d: Decision) => {
    if (!task) return
    if (pending.current) void send()
    const group: Group = d.kind === "approve" ? "done" : d.kind === "answer" ? "work" : "wait"
    setMoved(m => ({ ...m, [task.ref]: { from: task.group, to: group } }))
    const next = rows.find(t => t.group === "you" && t.ref !== task.ref)
    if (next) select(next.ref, open); else setOpen(false)
    const done = { approve: "Approved", send_back: "Sent back", answer: "Answered" }[d.kind]
    const unlocks = d.kind === "approve" && task.after?.group === "wait" ? ` ${task.after.ref} unlocked.` : ""
    pending.current = { ref: task.ref, d, timer: window.setTimeout(() => { setToast(null); void send() }, 5000) }
    setToast({ text: `${done} ${task.ref}.${unlocks}`, undo: true })
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
  const reviewing = task && task.status === "review" && moved[task.ref]?.from !== "you"

  const move = (step: number) => {
    const i = visible.findIndex(t => t.ref === task?.ref)
    const next = visible[Math.max(0, Math.min(visible.length - 1, i < 0 ? 0 : i + step))]
    if (next) select(next.ref, open)
  }
  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => { keys.current = e => {
    const typing = /INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)
    if (typing || e.metaKey || e.ctrlKey || e.altKey) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return }
    const k = e.key.toLowerCase()
    if (k === "j" || k === "arrowdown") { e.preventDefault(); move(1) }
    else if (k === "k" || k === "arrowup") { e.preventDefault(); move(-1) }
    else if (k === "a" && reviewing) act({ kind: "approve" })
    else if (k === "s" && reviewing) { e.preventDefault(); sendBack() }
    else if (k === "escape") setOpen(false)
  } })
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e)
    addEventListener("keydown", on)
    return () => removeEventListener("keydown", on)
  }, [])

  const needsYou = rows.some(t => t.group === "you")
  return (
    <div className={s.split}>
      <div className={s.list}>
        <div className={s.wrap}>
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
          <div className={s.keys} aria-hidden="true"><span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>A</kbd> approve</span><span><kbd>S</kbd> send back</span><span><kbd>Esc</kbd> close</span></div>
        </div>
      </div>

      <aside className={`${s.pane} ${open ? s.open : ""}`} aria-label="Task detail">
        <div className={s["p-hd"]}>
          <span className={s.mono}>{task?.ref}</span>
          <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Previous task" onClick={() => move(-1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg></button>
          <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Next task" onClick={() => move(1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
          <button className={`${s.btn} ${s["btn-ico"]} ${s.x}`} type="button" aria-label="Close" onClick={() => setOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className={s["p-bd"]} aria-live="polite">
          {!task ? <p className={s["p-none"]}>Pick a task to see it here.</p> : <>
            <h2>{task.title}</h2>
            <p className={s.tags}>
              <span className={s[{ you: "c-you", work: "c-work", wait: "c-bl", done: "c-ok" }[task.group]]}><Glyph g={task.group} />{LABEL[task.group][0].toUpperCase() + LABEL[task.group].slice(1)}</span>
              <span><Avatar name={task.agent} />{task.agent ?? "Unassigned"}</span>
            </p>
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
            {task.question && <>
              <p className={s.who}><b>{task.agent}</b> asked · <span suppressHydrationWarning>{ago(task.question.at)}</span></p>
              <p className={s.say}>{task.question.text}</p>
              {task.question.options.length ? (
                <div className={s.opts}>{task.question.options.map(o =>
                  <button key={o} className={`${s.btn} ${s["btn-line"]} ${s.mono}`} type="button" onClick={() => act({ kind: "answer", answer: o })}>{o}</button>)}</div>
              ) : (
                <form className={s.note} onSubmit={e => { e.preventDefault(); if (reply.trim()) act({ kind: "answer", answer: reply.trim() }) }}>
                  <label htmlFor="reply">Your answer</label>
                  <textarea id="reply" value={reply} maxLength={1000} onChange={e => setReply(e.target.value)} />
                  <div className={s.quick}><button type="submit">Send answer</button></div>
                </form>
              )}
              <p className={s.calm}>{task.question.options.length ? "Pick one and the agent carries on." : "The agent carries on when you answer."}</p>
            </>}
            {task.group === "work" && <>
              {task.steps_total > 0 && <p className={s.who}>Step <b>{Math.min(task.steps_done + 1, task.steps_total)} of {task.steps_total}</b></p>}
              {task.log.length > 0 && <ol className={s.log}>{task.log.map((l, i) =>
                <li key={i} className={i === task.log.length - 1 ? s.cur : undefined}><span suppressHydrationWarning>{time(l.at)}</span>{l.text}</li>)}</ol>}
              <p className={s.calm}>Nothing to do yet. It shows up under Needs you when it&apos;s ready.</p>
            </>}
            {task.group === "wait" && (task.before
              ? <Chain label="Starts when this is approved" a={task.before} b={task} caption={task.before.title} />
              : <p className={s.calm}>Ready to start. The next free agent picks it up.</p>)}
            {task.group === "done" && <p className={s.calm} suppressHydrationWarning>Approved by {task.approved_by ?? "you"} at {time(task.done_at)}.</p>}
          </>}
        </div>
        {reviewing && (
          <div className={s["p-ft"]}>
            <button className={`${s.btn} ${note === null ? s["btn-ghost"] : s["btn-line"]}`} type="button" onClick={sendBack}>{note === null ? <>Send back <kbd>S</kbd></> : "Send to agent"}</button>
            <button className={`${s.btn} ${s["btn-acc"]}`} type="button" onClick={() => act({ kind: "approve" })}>Approve <kbd>A</kbd></button>
          </div>
        )}
      </aside>

      <div className={`${s.toast} ${toast ? s.on : ""}`} role="status">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        <span>{toast?.text}</span>
        {toast?.undo && <button className={s.btn} type="button" onClick={undo}>Undo</button>}
      </div>
    </div>
  )
}
