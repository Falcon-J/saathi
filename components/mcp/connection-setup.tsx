export function McpConnectionSetup({ resource, reconnect = false, retainedConsent = false }: { resource: string; reconnect?: boolean; retainedConsent?: boolean }) {
  return <details className="rounded-lg border border-border p-4">
    <summary className="cursor-pointer font-medium text-primary">{reconnect ? 'Reconnect' : 'Connect an agent'}</summary>
    <div className="mt-4 space-y-4 text-sm">
      {retainedConsent && <p role="status">Disconnect this connection’s retained consent before reconnecting. This does not delete your tasks.</p>}
      <ol className="list-decimal space-y-3 pl-5">
        <li>Open the Saathi connection settings in your supported MCP client. {reconnect ? 'Remove its old connection and add Saathi again.' : 'Add Saathi as a remote MCP server.'}</li>
        <li><label className="block space-y-2"><span>Server URL</span><input aria-label="MCP server URL" readOnly value={resource} className="h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm" /></label></li>
        <li>Start sign-in from your client, then approve the workspaces, permissions and expiry in Saathi.</li>
      </ol>
      <p>Access stays off until you approve it. If your client reports that registration is unavailable, ask your administrator to register that client for Saathi.</p>
    </div>
  </details>
}
