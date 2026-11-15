'use client'

import { useActionState } from 'react'
import { disconnectMcpConnection } from '../../app/connections/actions'
import { Button } from '../ui/button'

export function McpDisconnectForm({ clientId, cleanupOnly = false }: { clientId: string; cleanupOnly?: boolean }) {
  const [state, action, pending] = useActionState(disconnectMcpConnection, {})
  return <form action={action} className="space-y-3">
    <input type="hidden" name="client_id" value={clientId} />
    <p className="text-sm text-muted-foreground">Disconnecting stops this agent from accessing your work. To reconnect, start a new connection and approve access again.</p>
    <Button type="submit" variant="destructive" disabled={pending}>{pending ? 'Disconnecting…' : cleanupOnly ? 'Finish disconnecting' : 'Disconnect'}</Button>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.revoked && <p role={state.providerCleanupPending ? 'alert' : 'status'} className="text-sm">{state.providerCleanupPending ? 'Application access is stopped. OAuth cleanup is pending; retry disconnecting before reconnecting.' : 'Disconnected.'}</p>}
  </form>
}
