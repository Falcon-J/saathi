"use client"

import { resourcePath } from "@/features/canvas/model"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { getCanvasResourceAccess, runCanvasAccessCommand, type CanvasAccessCommand } from "@/features/access/actions"
import type { AuthorizedCanvasResource, CanvasAccessDetails } from "@/features/access/service"
import { ACCESS_CAPABILITIES, type AccessCapability } from "@/features/access/contracts"
import type { Workspace } from "@/lib/data/workspaces"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function CompanyPanel({ actorId, resources, workspace, initialResourceId, refreshSignal = 0, onChanged, onWorkspace, onInvite }: {
  actorId: string; resources: AuthorizedCanvasResource[]; workspace?: Workspace; initialResourceId?: string | null
  refreshSignal?: number
  onChanged: () => Promise<void>; onWorkspace: (id: string) => void; onInvite: (workspaceId: string) => void
}) {
  const [selectedId, setSelectedId] = useState(initialResourceId ?? resources[0]?.id ?? "")
  const selected = resources.find(row => row.id === selectedId)
  const [storedDetails, setDetails] = useState<{ id: string; details: CanvasAccessDetails } | null>(null)
  const details = storedDetails?.id === selectedId ? storedDetails.details : null
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CanvasAccessCommand | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const writing = useRef(false)
  const retained = useRef<CanvasAccessCommand | null>(null)
  const storageKey = `saathi:canvas-access:${encodeURIComponent(actorId)}`
  const [companyName, setCompanyName] = useState("")
  const [containerName, setContainerName] = useState("")
  const [kind, setKind] = useState<"space" | "section">("section")
  const [mode, setMode] = useState<"inherit" | "restricted">("inherit")
  const [confirmAttach, setConfirmAttach] = useState(false)
  const [principal, setPrincipal] = useState("")
  const [capabilities, setCapabilities] = useState<AccessCapability[]>(["read"])
  const [memberId, setMemberId] = useState("")
  const [groupName, setGroupName] = useState("")
  const [linkTarget, setLinkTarget] = useState("")
  const manageable = Boolean(selected?.capabilities.includes("manage"))
  const organization = resources.find(row => row.id === selected?.organizationId)
  const manageOrganization = Boolean(organization?.capabilities.includes("manage"))
  const disabled = busy || Boolean(pending) || !storageReady
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      const command = raw ? JSON.parse(raw) : null
      if (command && typeof command.operation === "string" && typeof command.input?.commandId === "string") {
        retained.current = command; setPending(command)
      }
      setStorageReady(true)
    } catch { setError("Browser session storage is unavailable. Enable storage before changing access so an interrupted command can be recovered.") }
  }, [storageKey])
  useEffect(() => {
    let active = true
    if (!manageable || !selectedId) return
    void getCanvasResourceAccess(selectedId).then(result => {
      if (!active) return
      if (result.success) setDetails({ id: selectedId, details: result.details })
      else { setDetails(null); setError(result.error) }
    }).catch(() => { if (active) { setDetails(null); setError("Access settings are unavailable. Try again.") } })
    return () => { active = false }
  }, [manageable, selectedId, selected?.version, revision, refreshSignal])
  const run = async (command: CanvasAccessCommand) => {
    if (writing.current || !storageReady || (retained.current && retained.current.input.commandId !== command.input.commandId)) return
    const recovering = retained.current !== null
    try { sessionStorage.setItem(storageKey, JSON.stringify(command)) } catch {
      setError("Browser session storage is unavailable. Access was not changed."); return
    }
    writing.current = true; retained.current = command; setPending(command); setBusy(true); setError(null)
    try {
      const result = await runCanvasAccessCommand(command)
      if (!result.success) {
        if (!result.unknownOutcome && (!recovering || result.code === "conflict")) {
          retained.current = null; setPending(null); sessionStorage.removeItem(storageKey)
        }
        setError(`${result.error}${retained.current ? " The original command is retained for recovery. If access changed, ask a company manager to review it." : ""}`)
        if (result.code === "conflict" && !result.unknownOutcome) {
          setRevision(value => value + 1)
          try { await onChanged() } catch { /* The conflict remains visible and can be reconciled explicitly. */ }
        }
        return
      }
      retained.current = null; setPending(null)
      try { sessionStorage.removeItem(storageKey) } catch { /* Receipt replay remains safe. */ }
      setCompanyName(""); setContainerName(""); setGroupName(""); setConfirmAttach(false)
      if (["company.create", "container.create", "workspace.attach"].includes(command.operation)) setSelectedId(result.result.id)
      setRevision(value => value + 1)
      try { await onChanged() } catch { setError("Access change saved. Refresh the canvas to see its current state.") }
    } catch { setError("Unable to confirm the access change. Retry the original command to recover its result.") }
    finally { writing.current = false; setBusy(false) }
  }
  const submit = (event: FormEvent, command: CanvasAccessCommand) => { event.preventDefault(); void run(command) }
  return <div className="space-y-6">
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">{error}</p>}
    {pending && <div className="rounded-lg border border-border p-3"><p className="text-sm">An access change needs confirmation.</p><Button className="mt-2" disabled={busy} onClick={() => void run(pending)}>Retry original change</Button></div>}
    <form className="flex items-end gap-2" onSubmit={event => submit(event, { operation: "company.create", input: { id: crypto.randomUUID(), name: companyName, commandId: crypto.randomUUID() } })}>
      <div className="min-w-0 flex-1 space-y-1"><label htmlFor="canvas-company-name" className="text-sm font-medium">Company name</label><Input id="canvas-company-name" maxLength={100} required value={companyName} disabled={disabled} onChange={event => setCompanyName(event.target.value)} /></div><Button disabled={disabled || !companyName.trim()}>Create company</Button>
    </form>
    {resources.length > 0 && <div className="space-y-2"><label htmlFor="canvas-resource" className="text-sm font-medium">Company, section or workspace</label><select id="canvas-resource" className="w-full rounded-lg border border-border bg-background p-2" value={selectedId} disabled={busy} onChange={event => { setSelectedId(event.target.value); setPrincipal(""); setKind("section"); setError(null) }}><option value="">Select resource</option>{resources.map(row => <option key={row.id} value={row.id}>{resourcePath(row.id, resources).map(record => record.name).join(" / ")} ({row.kind === "organization" ? "company" : row.kind})</option>)}</select></div>}
    {selected && <Button variant="outline" size="sm" disabled={busy} onClick={() => { setRevision(value => value + 1); void onChanged().catch(() => setError("Unable to refresh the canvas. Try again.")) }}>Refresh access</Button>}
    {selected?.workspaceId && <Button variant="outline" onClick={() => onWorkspace(selected.workspaceId!)}>Open {selected.name}</Button>}
    {selected?.capabilities.includes("edit") && <form className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-4" onSubmit={event => {
      if (!resources.some(row => row.id === linkTarget && row.organizationId === selected.organizationId && row.id !== selected.id && row.capabilities.includes("read"))) { event.preventDefault(); return }
      submit(event, { operation: "reference.create", input: { id: crypto.randomUUID(), canvasResourceId: selected.id, targetResourceId: linkTarget, commandId: crypto.randomUUID() } })
    }}><div className="min-w-0 flex-1 space-y-1"><label htmlFor="canvas-link-target" className="text-sm font-medium">Link from {selected.name}</label><select id="canvas-link-target" required value={linkTarget} disabled={disabled} onChange={event => setLinkTarget(event.target.value)} className="w-full rounded border border-border bg-background p-2 text-sm"><option value="">Select destination</option>{resources.filter(row => row.id !== selected.id && row.organizationId === selected.organizationId && row.capabilities.includes("read")).map(row => <option key={row.id} value={row.id}>{resourcePath(row.id, resources).map(record => record.name).join(" / ")} ({row.kind === "organization" ? "company" : row.kind})</option>)}</select></div><Button disabled={disabled || !resources.some(row => row.id === linkTarget && row.id !== selected.id && row.organizationId === selected.organizationId)}>Create link</Button></form>}
    {selected && manageable && <>
      {selected.kind !== "workspace" && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => submit(event, { operation: "container.create", input: { id: crypto.randomUUID(), parentId: selected.id, name: containerName, kind, mode, commandId: crypto.randomUUID() } })}>
        <div className="space-y-1"><label htmlFor="canvas-section-name" className="text-sm font-medium">Section name</label><Input id="canvas-section-name" required maxLength={100} value={containerName} disabled={disabled} onChange={event => setContainerName(event.target.value)} /></div>
        <div className="flex flex-wrap items-center gap-3"><select aria-label="Container type" className="rounded border border-border bg-background p-2 text-sm" value={kind} disabled={disabled} onChange={event => setKind(event.target.value as "space" | "section")}><option value="section">Section</option>{selected.kind === "organization" && <option value="space">Space</option>}</select><select aria-label="New section access" className="rounded border border-border bg-background p-2 text-sm" value={mode} disabled={disabled} onChange={event => setMode(event.target.value as "inherit" | "restricted")}><option value="inherit">Inherit access</option><option value="restricted">Restricted access</option></select><Button disabled={disabled || !containerName.trim()}>Create {kind}</Button></div>
      </form>}
      {workspace && workspace.ownerUserId === actorId && ["space", "section"].includes(selected.kind) && !resources.some(row => row.workspaceId === workspace.id) && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => submit(event, { operation: "workspace.attach", input: { resourceId: crypto.randomUUID(), workspaceId: workspace.id, parentId: selected.id, mode: "inherit", expectedWorkspaceVersion: workspace.version, confirmMembershipRestriction: true, commandId: crypto.randomUUID() } })}>
        <h3 className="font-medium">Add {workspace.name} to {selected.name}</h3><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmAttach} disabled={disabled} onChange={event => setConfirmAttach(event.target.checked)} />Existing workspace members without section access will lose access. The workspace keeps one canonical parent.</label><Button disabled={disabled || !confirmAttach}>Attach workspace</Button>
      </form>}
      {details ? <>
        <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => {
          const [principalKind, id] = principal.split(":")
          submit(event, { operation: "access.grant", input: { id: crypto.randomUUID(), resourceId: selected.id, expectedVersion: details.resource.version, principal: { kind: principalKind as "user" | "group", id }, capabilities, commandId: crypto.randomUUID() } })
        }}><h3 className="font-medium">Share {selected.name}</h3><label className="sr-only" htmlFor="canvas-grant-principal">Person or group</label><select id="canvas-grant-principal" required value={principal} disabled={disabled} onChange={event => setPrincipal(event.target.value)} className="w-full rounded border border-border bg-background p-2 text-sm"><option value="">Person or group</option>{details.members.map(member => <option key={member.id} value={`user:${member.id}`}>{member.label}</option>)}{details.groups.map(group => <option key={group.id} value={`group:${group.id}`}>{group.name}</option>)}</select>
          <fieldset disabled={disabled} className="flex flex-wrap gap-x-4 gap-y-2"><legend className="sr-only">Capabilities</legend>{ACCESS_CAPABILITIES.map(capability => <label key={capability} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={capabilities.includes(capability)} disabled={capability === "read"} onChange={event => setCapabilities(values => event.target.checked ? [...values, capability] : values.filter(value => value !== capability))} />{capability}</label>)}</fieldset><p className="text-sm text-muted-foreground">Workspace membership is also required. Section sharing does not join people to contained workspaces.</p><div className="flex flex-wrap gap-2"><Button disabled={disabled || !principal}>Grant access</Button>{selected.workspaceId && <Button type="button" variant="outline" onClick={() => onInvite(selected.workspaceId!)}>{selected.name} invitations</Button>}</div>
        </form>
        <section className="space-y-3"><h3 className="font-medium">Explicit grants</h3>{details.grants.filter(grant => !grant.revokedAt).map(grant => <div key={grant.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{grant.principal.label}</p><p className="text-xs text-muted-foreground">{grant.capabilities.join(", ")}</p></div><Button size="sm" variant="outline" disabled={disabled} onClick={() => { if (window.confirm(`Revoke this grant for ${grant.principal.label}? Access provided by this grant will end.`)) void run({ operation: "access.revoke", input: { grantId: grant.id, resourceId: selected.id, expectedVersion: details.resource.version, commandId: crypto.randomUUID() } }) }}>Revoke</Button></div>)}</section>
        {selected.kind !== "organization" && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><p className="text-sm font-medium">{selected.mode === "restricted" ? "Restricted access" : "Inherited access"}</p><Button variant="outline" disabled={disabled} onClick={() => { const next = selected.mode === "inherit" ? "restricted" : "inherit"; if (window.confirm(next === "restricted" ? "Stop inheriting access? People relying on parent grants will lose access." : "Inherit parent access? Parent grants will apply to this resource.")) void run({ operation: "policy.set", input: { resourceId: selected.id, expectedVersion: details.resource.version, mode: next, commandId: crypto.randomUUID() } }) }}>{selected.mode === "inherit" ? "Restrict access" : "Inherit access"}</Button></div>}
        {manageOrganization && <>
          {workspace && <form className="flex flex-wrap gap-2" onSubmit={event => submit(event, { operation: "member.add", input: { organizationId: selected.organizationId, userId: memberId, commandId: crypto.randomUUID() } })}><select aria-label="Workspace teammate to add to company" required value={memberId} disabled={disabled} onChange={event => setMemberId(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm"><option value="">Workspace teammate</option>{workspace.members.filter(member => !details.members.some(existing => existing.id === member.userId)).map(member => <option key={member.userId} value={member.userId}>{member.username || member.email}</option>)}</select><Button disabled={disabled || !memberId}>Add to company</Button></form>}
          <form className="flex items-end gap-2" onSubmit={event => submit(event, { operation: "group.create", input: { id: crypto.randomUUID(), organizationId: selected.organizationId, name: groupName, commandId: crypto.randomUUID() } })}><div className="min-w-0 flex-1 space-y-1"><label htmlFor="canvas-group-name" className="text-sm font-medium">Group name</label><Input id="canvas-group-name" required value={groupName} maxLength={100} disabled={disabled} onChange={event => setGroupName(event.target.value)} /></div><Button disabled={disabled || !groupName.trim()}>Create group</Button></form>
          {details.groups.map(group => <fieldset key={group.id} disabled={disabled} className="space-y-2 rounded-lg border border-border p-3"><legend className="px-1 text-sm font-medium">{group.name}</legend>{details.members.map(member => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group.memberIds.includes(member.id)} onChange={event => void run({ operation: "group.member", input: { organizationId: selected.organizationId, groupId: group.id, userId: member.id, active: event.target.checked, expectedVersion: group.version, commandId: crypto.randomUUID() } })} />{member.label}</label>)}</fieldset>)}
        </>}
      </> : <p role="status">Loading access settings…</p>}
    </>}
  </div>
}
