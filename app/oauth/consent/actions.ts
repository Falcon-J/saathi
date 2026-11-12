'use server'

import { redirect } from 'next/navigation'
import { requireMcpAccountAction } from '../../../components/mcp/account-boundary'
import { decideMcpConsent, mcpRedirectUris, type ConsentState } from '../../../components/mcp/consent-service'
import { saveMcpDelegation, revokeMcpDelegation } from '../../../features/mcp/delegations'

export async function submitMcpConsent(_previous: ConsentState, form: FormData): Promise<ConsentState> {
  let destination: string
  try {
    const { config, session, client } = await requireMcpAccountAction()
    destination = await decideMcpConsent({ actorId: session.id, authorizationId: String(form.get('authorization_id') ?? ''), clientIds: config.clientIds, redirectUris: mcpRedirectUris(), form }, {
      async getDetails(id) { const { data, error } = await client.auth.oauth.getAuthorizationDetails(id); if (error || !data) throw new Error('Authorization unavailable'); return data },
      save: saveMcpDelegation,
      revoke: revokeMcpDelegation,
      async approve(id) { const { data, error } = await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }); if (error || !data) throw new Error('Authorization incomplete'); return data },
      async deny(id) { const { data, error } = await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true }); if (error || !data) throw new Error('Authorization unavailable'); return data },
    })
  } catch {
    return { error: 'Authorization could not be completed. Review Connections before reconnecting; access may need to be revoked there.' }
  }
  redirect(destination)
}
