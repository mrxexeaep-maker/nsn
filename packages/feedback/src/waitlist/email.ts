import { html } from 'hono/html'

/** The confirmation email for a waitlist sign-up; the links carry the sign-up's token only. */
export async function confirmationEmail({
  confirmURL,
  leaveURL
}: {
  confirmURL: string
  leaveURL: string
}) {
  const subject = 'Confirm your place on the OpenPencil Cloud waitlist'
  const text = [
    'Thanks for your interest in OpenPencil Cloud.',
    '',
    `Confirm your email to join the waitlist: ${confirmURL}`,
    '',
    'We will write when Cloud is ready for you, and only about that.',
    `If you did not sign up, ignore this email, or remove your address now: ${leaveURL}`
  ].join('\n')
  const body = html`<p>Thanks for your interest in OpenPencil Cloud.</p>
    <p><a href="${confirmURL}">Confirm your email</a> to join the waitlist.</p>
    <p>We will write when Cloud is ready for you, and only about that.</p>
    <p>
      If you did not sign up, ignore this email, or
      <a href="${leaveURL}">remove your address</a> now.
    </p>`
  return { subject, text, html: await body }
}
