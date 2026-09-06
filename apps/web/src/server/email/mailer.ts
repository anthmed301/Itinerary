import { webEnv } from '@tether/shared/env'
import nodemailer from 'nodemailer'
import { type AuthEvent, authLog } from '../log'
import type { Email } from './templates'

// Mailpit in dev (no auth, no TLS). Stage 2 swaps host/port for a real relay;
// nothing else here changes.
let cached: nodemailer.Transporter | undefined

function transport(): nodemailer.Transporter {
  const env = webEnv()
  cached ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ignoreTLS: true,
  })
  return cached
}

/**
 * A09: logs the event and the user id — never the recipient address (PII) and
 * never the body, which carries single-use verification and reset tokens.
 */
export async function sendEmail(
  to: string,
  email: Email,
  event: AuthEvent,
  userId: string,
): Promise<void> {
  await transport().sendMail({
    from: webEnv().EMAIL_FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  authLog(event, { userId })
}
