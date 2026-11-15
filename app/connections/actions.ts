'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '../../lib/db/client'
import { revokeMcpDelegation } from '../../features/mcp/delegations'
import { requireMcpDisconnectAction } from '../../components/mcp/account-boundary'
import { revokeMcpConnection, type ConsentState } from '../../components/mcp/consent-service'

export async function disconnectMcpConnection(_previous: ConsentState, form: FormData): Promise<ConsentState> {
  try {
    const { session, allowedClientIds, getProviderClient } = await requireMcpDisconnectAction()
    const clientId = z.uuid().parse(form.get('client_id'))
    const [grant] = await getDb()`SELECT id FROM platform_delegations WHERE actor_user_id=${session.id} AND client_id=${clientId}`
    let providerCleanupPending = false
    if (grant) {
      const result = await revokeMcpConnection(session.id, grant.id, clientId, {
        revoke: revokeMcpDelegation,
        async revokeProvider(id) { const client = await getProviderClient(); const { error } = await client.auth.oauth.revokeGrant({ clientId: id }); if (error) throw new Error('Provider cleanup unavailable') },
      })
      providerCleanupPending = result.providerCleanupPending
    } else {
      if (!allowedClientIds.includes(clientId)) throw new Error('Connection unavailable')
      // No application delegation exists. Clean up only this user's provider consent.
      const client = await getProviderClient()
      const { data, error } = await client.auth.oauth.listGrants()
      if (error || !data?.some(value => value.client.id === clientId)) throw new Error('Connection unavailable')
      const result = await client.auth.oauth.revokeGrant({ clientId })
      providerCleanupPending = Boolean(result.error)
    }
    try { revalidatePath('/connections') } catch { /* Cache refresh cannot undo local revocation. */ }
    return { revoked: true, providerCleanupPending }
  } catch { return { error: 'Could not finish disconnecting. Reload Connections and retry.' } }
}
