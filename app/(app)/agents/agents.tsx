"use client"
// The Agents page from agents-v1: the roster, the open agent in the pane, and Connect, New key and Revoke dialogs.
// Any event in the workspace nudges a re-read, so a new connection or a silent agent shows up by itself.
import { useEffect, useRef, useState } from "react"
import { agentAction, type AgentAction, type Result } from "./actions"
import { useLive } from "../live"
import s from "../app.module.css"
import a from "./agents.module.css"

type Held = { ref: string; title: string; status: string; silent_at: string | null; steps_done: number; steps_total: number }
export type Agent = {
  id: string; name: string; client: string; host: string | null; max_at_once: number; paused: boolean
  seen_at: string | null; listening: boolean; created_at: string; holding: Held[]
  key: { last4: string; created_at: string; used_at: string | null } | null
  done_today: number; recent: { at: string; kind: string; data: Record<string, string | number>; task: string | null; me: boolean }[]
}
type Tone = "you" | "work" | "wait" | "idle"
const TONE: Record<Tone, [string, string]> = { you: ["Needs you", "c-you"], work: ["Working", "c-work"], wait: ["Listening", "c-bl"], idle: ["Idle", "c-fa"] }
const TABS = ["Claude Code", "Cursor", "Other"] as const

function ago(at: string | null) {
  if (!at) return "never"
  const min = Math.round((Date.now() - Date.parse(at)) / 60000)
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`
}
const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

// What the agent is doing, in one line, and its tone. Minutes count from the read (at), so server and client agree.
// A silent agent needs you even when paused, so Release stays on offer.
function status(g: Agent, at: string): { tone: Tone; text: string; silent?: Held } {
  const silent = g.holding.find(h => h.silent_at), asked = g.holding.find(h => h.status === "question"), now = g.holding[0]
  if (silent) return { tone: "you", text: `Silent ${Math.max(1, Math.round((Date.parse(at) - Date.parse(silent.silent_at!)) / 60000))} min, holding ${silent.ref}`, silent }
  if (asked) return { tone: "you", text: `Asked about ${asked.ref}` }
  if (g.paused) return { tone: "idle", text: now ? `Paused by you. Finishes ${now.ref} first` : "Paused by you" }
  if (now) return { tone: "work", text: `Working on ${g.holding.map(h => h.ref).join(", ")}` }
  if (g.listening) return { tone: "wait", text: "Listening for ready work" }
  return { tone: "idle", text: g.seen_at ? "Idle" : "Not connected yet" }
}
function said(e: Agent["recent"][number]) {
  const who = e.me ? "You" : "Someone"
  switch (e.kind) {
    case "agent.connected": return `Connected as ${e.data.name}`
    case "task.claimed": return `Picked up ${e.task}`
    case "task.submitted": return `Finished ${e.task}`
    case "task.approved": return `${who} approved ${e.task}`
    case "task.released": return `Let go of ${e.task}`
    case "task.question": return `Asked about ${e.task}`
    case "key.created": return `${who} made a key ending ${e.data.last4}`
    case "agent.paused": return `${who} paused it`
    case "agent.resumed": return `${who} resumed it`
    case "agent.limit": return `${who} set it to ${e.data.max} at a time`
    case "task.sent_back": return `${who} sent back ${e.task}`
    case "task.answered": return `${who} answered on ${e.task}`
    case "task.silent": return `Went silent on ${e.task}`
    case "key.revoked": return `${who} revoked its key`
    default: return e.task ? `Updated ${e.task}` : "Updated"
  }
}
const command = (tab: (typeof TABS)[number], url: string, key: string) =>
  tab === "Claude Code" ? `claude mcp add --transport http saathi ${url} --header "Authorization: Bearer ${key}"`
  : tab === "Cursor" ? JSON.stringify({ mcpServers: { saathi: { url, headers: { Authorization: `Bearer ${key}` } } } })
  : `Authorization: Bearer ${key}`
const X = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const Av = ({ name }: { name: string }) => <span className={s.av} aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>

function Copy({ text, onCopy }: { text: string; onCopy?: () => void }) {
  const [done, setDone] = useState(false)
  return <button className={`${s.btn} ${s["btn-line"]}`} type="button" disabled={!text}
                 onClick={() => { void navigator.clipboard?.writeText(text).then(() => setDone(true), () => {}); onCopy?.() }}>{done ? "Copied" : "Copy"}</button>
}

export function Agents({ ws, wsName, agents, picked, mcpUrl, at }: { ws: string; wsName: string; agents: Agent[]; picked: string | null; mcpUrl: string; at: string }) {
  const { offline, retryIn, retry } = useLive(ws)
  const [sel, setSel] = useState(picked)
  const [open, setOpen] = useState(!!picked)
  const [toast, setToast] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [conn, setConn] = useState<{ agent?: string; key?: string; copied: boolean; err?: string } | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]>("Claude Code")
  const [newKey, setNewKey] = useState<string | null>(null)
  const connOpen = useRef(false)
  const connect = useRef<HTMLDialogElement>(null), keyDlg = useRef<HTMLDialogElement>(null), revokeDlg = useRef<HTMLDialogElement>(null)
  const ag = agents.find(g => g.id === sel) ?? agents[0]
  const st = ag && status(ag, at)
  const joined = conn?.agent ? agents.find(g => g.id === conn.agent && g.seen_at) : undefined

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) }, [toast])
  const pick = (id: string) => { setSel(id); setErr(null); setOpen(true); history.replaceState(null, "", `/agents?agent=${id}`) }
  const run = async (act: AgentAction, ok?: (r: Result) => void) => {
    setErr(null)
    const r = await agentAction(ws, act).catch((): Result => ({ ok: false }))
    if (!r.ok) { setErr(r.message ?? "Couldn't save that. Try again."); return }
    ok?.(r)
  }
  const openConnect = () => {
    setConn({ copied: false }); setTab("Claude Code"); connect.current?.showModal(); connOpen.current = true
    void agentAction(ws, { kind: "connect" }).catch((): Result => ({ ok: false })).then(r => {
      // Closed before the key came back: nobody saw it, so drop it.
      if (!connOpen.current) { if (r.agent_id) void agentAction(ws, { kind: "revoke", agent: r.agent_id }); return }
      setConn(c => c && (r.ok && r.key ? { ...c, agent: r.agent_id, key: r.key } : { ...c, err: r.message ?? "Couldn't make a key. Close this and try again." }))
    })
  }
  // Closing before the agent connects drops a key nobody copied, so opening Connect twice leaves no stray agents.
  const closedConnect = () => {
    connOpen.current = false
    if (conn?.agent && !joined && !conn.copied) void agentAction(ws, { kind: "revoke", agent: conn.agent })
    if (joined) pick(joined.id)
    setConn(null)
  }
  const off = offline || !ag

  const summary = {
    you: agents.filter(g => status(g, at).tone === "you").length, work: agents.filter(g => status(g, at).tone === "work").length,
    wait: agents.filter(g => status(g, at).tone === "wait").length, done: agents.reduce((n, g) => n + g.done_today, 0),
  }
  return (
    <>
      <header className={s.tb}>
        <h1>Agents</h1>
        <button className={`${s.btn} ${s["btn-line"]}`} type="button" disabled={offline} onClick={openConnect}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          <span>Connect agent</span>
        </button>
      </header>
      <div className={`${s.split} ${agents.length ? "" : a.solo}`}>
        <div className={s.list}>
          <div className={s.wrap}>
            {offline && (
              <div className={s.off} role="status">
                <p suppressHydrationWarning>Can&apos;t reach Saathi. Status from {time(at)}.</p>
                <span className={s.mono}>Trying again in {retryIn} s</span>
                <button className={`${s.btn} ${s["btn-line"]}`} type="button" onClick={retry}>Retry now</button>
              </div>
            )}
            {!agents.length ? (
              <div className={a.empty}>
                <h2>No agents yet</h2>
                <p>Connect an agent and it picks up ready tasks in {wsName}.</p>
                <button className={`${s.btn} ${s["btn-acc"]}`} type="button" disabled={offline} onClick={openConnect}>Connect agent</button>
              </div>
            ) : <>
              <p className={a.sum}>
                <span className={summary.you ? s["c-you"] : ""}>{summary.you} needs you</span><span>{summary.work} working</span>
                <span>{summary.wait} listening</span><span>{summary.done} done today</span>
              </p>
              <div className={a.hd} aria-hidden="true"><span /><span /><span>Agent</span><span className={a.cst}>Status</span>
                <span className={`${a.r} ${a.cseen}`}>Seen</span><span className={`${a.r} ${a.ckey}`}>Key</span><span /></div>
              <ul className={a.ags}>
                {agents.map(g => {
                  const t = status(g, at)
                  return (
                    <li key={g.id}>
                      <button className={a.ag} type="button" aria-current={g.id === ag?.id || undefined} aria-label={`${g.name}, ${t.text}`} onClick={() => pick(g.id)}>
                        <span className={s[TONE[t.tone][1]]} aria-hidden="true">●</span><Av name={g.name} />
                        <span className={a.nm}><b>{g.name}</b><small>{g.host ?? g.client}<span className={a.smst}> · {t.text}</span></small></span>
                        <span className={`${a.stt} ${s[TONE[t.tone][1]]}`}><span>{t.text}</span></span>
                        <span className={`${s.mono} ${a.r} ${a.seen}`} suppressHydrationWarning>{ago(g.seen_at)}</span>
                        <span className={`${s.mono} ${a.r} ${a.key}`}>{g.key ? `…${g.key.last4}` : ""}</span>
                        <span aria-hidden="true">›</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className={a.foot}>Keys are shown once. Saathi keeps only the last four characters.</p>
            </>}
          </div>
        </div>

        <aside className={`${s.pane} ${open ? s.open : ""}`} aria-label="Agent detail">
          <div className={s["p-hd"]}>
            <span className={`${s.mono} ${st ? s[TONE[st.tone][1]] : ""}`}>{st ? TONE[st.tone][0] : ""}</span>
            <button className={`${s.btn} ${s["btn-ico"]} ${s.x}`} type="button" aria-label="Close" onClick={() => setOpen(false)}><X /></button>
          </div>
          {ag && st && <>
            <div className={s["p-bd"]} aria-live="polite">
              <div className={a.who}><Av name={ag.name} /><div><h2>{ag.name}</h2>
                <p suppressHydrationWarning>{[ag.host, `seen ${ago(ag.seen_at)}`].filter(Boolean).join(" · ")}</p></div></div>
              {st.silent ? (
                <div className={a.call}>
                  <p>{st.text}. Release it and it goes back to Ready for any agent.</p>
                  <button className={`${s.btn} ${s["btn-ink"]}`} type="button" disabled={offline}
                          onClick={() => run({ kind: "release", task: st.silent!.ref }, () => setToast(`${st.silent!.ref} is Ready.`))}>Release {st.silent.ref} now</button>
                </div>
              ) : (
                <p className={`${a.beat} ${s[TONE[st.tone][1]]}`}><span className={a.dot} />{st.text}
                  {st.tone === "work" && ag.holding[0].steps_total > 0 &&
                    <span className={s.bar} aria-label={`${ag.holding[0].steps_done} of ${ag.holding[0].steps_total} steps`}>
                      {Array.from({ length: ag.holding[0].steps_total }, (_, i) => <i key={i} className={i < ag.holding[0].steps_done ? s.on : ""} />)}</span>}
                </p>
              )}
              {err && <p className={s.err} role="alert">{err}</p>}
              <dl className={a.props}>
                <dt>Holding</dt><dd>{ag.holding.length ? ag.holding.map(h => <span key={h.ref} className={s.mono}>{h.ref}</span>) : <span className={s["c-fa"]}>Nothing</span>}</dd>
                <dt><label htmlFor="at-once">At a time</label></dt>
                <dd><select id="at-once" value={ag.max_at_once} disabled={offline}
                            onChange={e => void run({ kind: "limit", agent: ag.id, max: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select><small>tasks</small></dd>
                <dt>Can work on</dt><dd>All tasks in {wsName}</dd>
                <dt>Done today</dt><dd className={s.mono}>{ag.done_today}</dd>
                <dt>Key</dt><dd>{ag.key ? <><span className={s.mono}>sk_…{ag.key.last4}</span>
                  <small suppressHydrationWarning>made {ago(ag.key.created_at)}, used {ago(ag.key.used_at)}</small></> : <span className={s["c-fa"]}>None</span>}</dd>
              </dl>
              {ag.recent.length > 0 && <ul className={s.hist}>
                {ag.recent.map((e, i) => <li key={i}><span>{said(e)}</span> <span className={`${s.mono} ${s["c-fa"]}`} suppressHydrationWarning>{ago(e.at)}</span></li>)}
              </ul>}
            </div>
            <div className={s["p-ft"]}>
              <button className={`${s.btn} ${s["btn-line"]}`} type="button" disabled={off}
                      onClick={() => run({ kind: "pause", agent: ag.id, paused: !ag.paused }, () => setToast(`${ag.name} ${ag.paused ? "resumed" : "paused"}`))}>
                {ag.paused ? "Resume" : "Pause"}</button>
              <button className={`${s.btn} ${s["btn-line"]}`} type="button" disabled={off}
                      onClick={() => run({ kind: "rotate", agent: ag.id }, r => { setNewKey(r.key ?? null); keyDlg.current?.showModal() })}>New key</button>
              <button className={`${s.btn} ${a["btn-rv"]}`} type="button" disabled={off} onClick={() => { setErr(null); revokeDlg.current?.showModal() }}>Revoke</button>
            </div>
          </>}
        </aside>

        <div className={`${s.toast} ${toast ? s.on : ""}`} role="status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          <span>{toast}</span>
        </div>
      </div>

      <dialog ref={connect} className={s.dlg} aria-labelledby="c-l" onClose={closedConnect} onCopy={() => setConn(c => c && { ...c, copied: true })}>
        <div className={a.dbd}>
          <h2 id="c-l">Connect an agent</h2>
          <p>Run this where your agent works. It gets its own key.</p>
          <div className={a.seg} role="tablist">
            {TABS.map(t => <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          <div className={`${a.cmd} ${tab === "Claude Code" ? a.sh : ""}`} role="tabpanel">
            <code>{conn?.key ? command(tab, mcpUrl, conn.key) : "Making a key…"}</code>
            <Copy key={`${tab}${conn?.key}`} text={conn?.key ? command(tab, mcpUrl, conn.key) : ""} onCopy={() => setConn(c => c && { ...c, copied: true })} />
          </div>
          <p className={a.hint}>{tab === "Claude Code" ? "Paste it in a terminal." : tab === "Cursor" ? "Add it to ~/.cursor/mcp.json." : `Point your agent at ${mcpUrl} over HTTP with this header.`}</p>
          {conn?.err ? <p className={s.err} role="alert">{conn.err}</p> : (
            <div className={`${a.wait} ${joined ? a.ok : ""}`} aria-live="polite">
              <span className={a.dot} />{joined ? `Connected: ${joined.name}` : "Listening for your agent. This updates by itself."}
            </div>
          )}
        </div>
        <div className={`${s["d-ft"]} ${a.end}`}>
          <button className={`${s.btn} ${joined ? s["btn-acc"] : s["btn-line"]}`} type="button" onClick={() => connect.current?.close()}>{joined ? "Done" : "Cancel"}</button>
        </div>
      </dialog>

      <dialog ref={keyDlg} className={s.dlg} aria-labelledby="k-l" onClose={() => setNewKey(null)}>
        <div className={a.dbd}>
          <h2 id="k-l">New key for {ag?.name}</h2>
          <p>Copy it now. You won&apos;t see it again. The old key stops working at once.</p>
          <div className={a.cmd}><code>{newKey}</code><Copy key={newKey} text={newKey ?? ""} /></div>
        </div>
        <div className={`${s["d-ft"]} ${a.end}`}>
          <button className={`${s.btn} ${s["btn-acc"]}`} type="button" onClick={() => keyDlg.current?.close()}>Done</button>
        </div>
      </dialog>

      <dialog ref={revokeDlg} className={s.dlg} aria-labelledby="r-l">
        <div className={a.dbd}>
          {err && <p className={s.err} role="alert">{err}</p>}
          <h2 id="r-l">Revoke {ag?.name}&apos;s key?</h2>
          <p>{ag?.name} stops at once.{ag?.holding.length ? ` ${ag.holding.map(h => h.ref).join(", ")} goes back to Ready.` : ""} This can&apos;t be undone. You can connect it again with a new key.</p>
        </div>
        <div className={`${s["d-ft"]} ${a.end}`}>
          <button className={`${s.btn} ${s["btn-ghost"]}`} type="button" onClick={() => revokeDlg.current?.close()}>Cancel</button>
          <button className={`${s.btn} ${a["btn-er"]}`} type="button" disabled={offline}
                  onClick={() => ag && run({ kind: "revoke", agent: ag.id }, r => {
                    revokeDlg.current?.close()
                    setToast(r.freed?.length ? `Key revoked. ${r.freed.join(", ")} ${r.freed.length > 1 ? "are" : "is"} Ready.` : "Key revoked.")
                    setSel(null); history.replaceState(null, "", "/agents")
                  })}>Revoke key</button>
        </div>
      </dialog>
    </>
  )
}
