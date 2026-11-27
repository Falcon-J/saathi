"use client"
// The New task dialog from task-v1. A native <dialog> keeps focus inside, closes on Esc and gives focus back.
import { useState, type RefObject } from "react"
import { createTask } from "../actions"
import s from "../app.module.css"

const PRIORITY: [string, number][] = [["Urgent", 4], ["High", 3], ["Normal", 2], ["Low", 1]]

export function NewTask({ ref, ws, open, agents, offline, onCreated }: {
  ref: RefObject<HTMLDialogElement | null>; ws: string; offline: boolean
  open: { ref: string; title: string }[]; agents: { id: string; name: string }[]
  onCreated: (ref: string, waitsOn: string) => void
}) {
  const [f, setF] = useState({ waitsOn: "", agent: "", priority: "", more: false })
  const [err, setErr] = useState<{ title?: boolean; doneWhen?: boolean; server?: string }>({})
  const [busy, setBusy] = useState(false)
  const agentName = f.agent === "me" ? "Me" : agents.find(a => a.id === f.agent)?.name

  const submit = async (form: HTMLFormElement) => {
    const v = (n: string) => String(new FormData(form).get(n) ?? "").trim()
    const title = v("title"), doneWhen = v("doneWhen")
    if (!title) { setErr({ title: true }); form.querySelector<HTMLInputElement>("[name=title]")?.focus(); return }
    if (!doneWhen && f.agent !== "me") { setErr({ doneWhen: true }); form.querySelector<HTMLInputElement>("[name=doneWhen]")?.focus(); return }
    setBusy(true)
    const r = await createTask(ws, { title, doneWhen, details: v("details"), waitsOn: f.waitsOn, agent: f.agent,
                                     priority: PRIORITY.find(p => p[0] === f.priority)?.[1] ?? 0 })
      .catch(() => ({ ok: false, ref: undefined, message: "Couldn't create it. Try again." }))
    setBusy(false)
    if (!r.ok || !r.ref) { setErr({ server: r.message ?? "Couldn't create it. Try again." }); return }
    onCreated(r.ref, f.waitsOn)
    form.reset()
    setErr({})
    setF({ waitsOn: "", agent: "", priority: "", more: f.more })
    if (f.more) form.querySelector<HTMLInputElement>("[name=title]")?.focus(); else ref.current?.close()
  }

  return (
    <dialog ref={ref} className={s.dlg} aria-labelledby="d-l" onClose={() => setErr({})} onMouseDown={e => { if (e.target === e.currentTarget) ref.current?.close() }}>
      <form noValidate onSubmit={e => { e.preventDefault(); void submit(e.currentTarget) }}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.requestSubmit() } }}>
        <div className={s["d-hd"]}><span id="d-l">New task</span>
          <button className={`${s.btn} ${s["btn-ico"]}`} type="button" aria-label="Close" onClick={() => ref.current?.close()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className={s["d-bd"]}>
          <input className={s["d-title"]} name="title" placeholder={err.title ? "Give it a title first" : "Task title"} aria-label="Task title"
                 aria-invalid={err.title || undefined} maxLength={200} autoComplete="off" autoFocus onInput={() => err.title && setErr(e => ({ ...e, title: false }))} />
          <div className={`${s["d-dw"]} ${err.doneWhen ? s.bad : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
            <input name="doneWhen" placeholder="Done when… what the agent must show to finish" aria-label="Done when" maxLength={1000} autoComplete="off"
                   aria-invalid={err.doneWhen || undefined} aria-describedby={err.doneWhen ? "d-err" : undefined} onInput={() => err.doneWhen && setErr(e => ({ ...e, doneWhen: false }))} />
          </div>
          {err.doneWhen && <p className={s.err} id="d-err">Agents only pick up tasks with a Done when. Add one, or give it to yourself.</p>}
          {err.server && <p className={s.err} role="alert">{err.server}</p>}
          <textarea className={s["d-det"]} name="details" placeholder="Details, links or files (optional)" aria-label="Details" maxLength={4000} />
          <div className={s.chips}>
            <label className={`${s.chip} ${f.waitsOn ? s.set : ""}`}>
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" /></svg>
              <span>{f.waitsOn ? `After ${f.waitsOn}` : "Waits on"}</span>
              <select aria-label="Waits on" value={f.waitsOn} onChange={e => setF({ ...f, waitsOn: e.target.value })}>
                <option value="">Nothing</option>{open.map(t => <option key={t.ref} value={t.ref}>{t.ref} · {t.title}</option>)}
              </select>
            </label>
            <label className={`${s.chip} ${f.agent ? s.set : ""}`}>
              <span className={s.av} style={{ width: 18, height: 18, fontSize: 10 }} aria-hidden="true">{agentName?.[0] ?? "·"}</span>
              <span>{agentName ?? "Any agent"}</span>
              <select aria-label="Who" value={f.agent} onChange={e => { setF({ ...f, agent: e.target.value }); setErr(x => ({ ...x, doneWhen: false })) }}>
                <option value="">Any agent</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="me">Me</option>
              </select>
            </label>
            <label className={`${s.chip} ${f.priority ? s.set : ""}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 20v-6M12 20V9M18 20V4" /></svg>
              <span>{f.priority || "Priority"}</span>
              <select aria-label="Priority" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
                <option value="">No priority</option>{PRIORITY.map(([p]) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className={s["d-ft"]}>
          <label className={s.tog}><input type="checkbox" checked={f.more} onChange={e => setF({ ...f, more: e.target.checked })} />Create more</label>
          <button className={`${s.btn} ${s["btn-ink"]}`} type="submit" disabled={busy || offline}>Create task <kbd>⌘ ↵</kbd></button>
        </div>
      </form>
    </dialog>
  )
}
