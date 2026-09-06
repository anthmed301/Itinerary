export type Email = { subject: string; text: string; html: string }

/**
 * A05 (Injection). Emails embed a user-chosen display name and mail clients
 * render HTML, so every interpolated value is escaped. There is no templating
 * library here on purpose — one function, auditable in ten lines.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(heading: string, body: string, cta: { label: string; url: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#171717">
  <h1 style="font-size:20px">${heading}</h1>
  ${body}
  <p><a href="${cta.url}" style="display:inline-block;background:#171717;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${cta.label}</a></p>
  <p style="font-size:12px;color:#737373">If the button does not work, paste this into your browser:<br>${cta.url}</p>
</body></html>`
}

export function verificationEmail(input: { name: string; url: string }): Email {
  const name = escapeHtml(input.name)
  return {
    subject: 'Confirm your Tripi email address',
    text: `Hi ${input.name},\n\nConfirm your email address:\n${input.url}\n\nThis link expires in 24 hours.`,
    html: layout(
      `Hi ${name},`,
      '<p>Confirm your email address to finish setting up your Tripi account. This link expires in 24 hours.</p>',
      { label: 'Confirm email', url: input.url },
    ),
  }
}

export function resetPasswordEmail(input: { name: string; url: string }): Email {
  const name = escapeHtml(input.name)
  return {
    subject: 'Reset your Tripi password',
    text: `Hi ${input.name},\n\nReset your password:\n${input.url}\n\nThis link expires in 1 hour and can be used once. If you did not ask for this, ignore this email.`,
    html: layout(
      `Hi ${name},`,
      '<p>Reset your password using the button below. This link expires in 1 hour and can only be used once. If you did not request it, you can safely ignore this email.</p>',
      { label: 'Reset password', url: input.url },
    ),
  }
}
