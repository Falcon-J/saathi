type InvitationEmailInput = {
  inviterName: string
  workspaceName: string
  invitationUrl: string
}

export type RenderedEmail = {
  subject: string
  text: string
  html: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

export function renderInvitationEmail({ inviterName, workspaceName, invitationUrl }: InvitationEmailInput): RenderedEmail {
  const safeInviterName = escapeHtml(inviterName)
  const safeWorkspaceName = escapeHtml(workspaceName)
  const safeInvitationUrl = escapeHtml(invitationUrl)
  const subject = `${inviterName} invited you to ${workspaceName} on Saathi`
  const text = `${inviterName} invited you to join the ${workspaceName} workspace on Saathi.

Review the invitation and create an account or sign in with the email address that received this message:
${invitationUrl}

This invitation expires in seven days. Ignore this email if it was unexpected.`
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f7f8f5;color:#122039;font-family:Arial,Helvetica,sans-serif;">
    <div style="padding:32px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe8e5;border-radius:20px;overflow:hidden;">
        <div style="padding:24px 32px;background:#f1faf7;border-bottom:1px solid #dfe8e5;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-.04em;">Saathi</div>
          <div style="margin-top:6px;color:#52706b;font-size:13px;">Move from intention to action.</div>
        </div>
        <div style="padding:32px;">
          <div style="color:#0f766e;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Workspace invitation</div>
          <h1 style="margin:12px 0 0;font-size:28px;line-height:1.15;letter-spacing:-.04em;">You’re invited to work together</h1>
          <p style="margin:18px 0 0;font-size:16px;line-height:1.6;color:#52627a;"><strong style="color:#122039;">${safeInviterName}</strong> invited you to join <strong style="color:#122039;">${safeWorkspaceName}</strong> on Saathi.</p>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#52627a;">Open the invitation to create an account or sign in, then review and accept it.</p>
          <p style="margin:28px 0;text-align:center;"><a href="${safeInvitationUrl}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#2c9887;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Review invitation</a></p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#718096;">This invitation expires in seven days. If you were not expecting it, you can safely ignore this message.</p>
        </div>
        <div style="padding:18px 32px;background:#fafcfb;border-top:1px solid #edf2f0;color:#718096;font-size:12px;line-height:1.5;">You’re receiving this because a Saathi workspace owner invited this address.</div>
      </div>
    </div>
  </body>
</html>`
  return { subject, text, html }
}
