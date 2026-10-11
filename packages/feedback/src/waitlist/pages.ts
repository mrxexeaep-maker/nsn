import { html } from 'hono/html'

/** A small standalone page for the links in waitlist emails. */
export function page(title: string, body: string | ReturnType<typeof html>) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title} · OpenPencil</title>
        <style>
          :root {
            color-scheme: light dark;
            font-family: system-ui, sans-serif;
          }
          body {
            max-width: 32rem;
            margin: 15vh auto;
            padding: 0 1rem;
            line-height: 1.5;
          }
          button {
            font: inherit;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${body}
      </body>
    </html>`
}

/**
 * Asks before acting: mail scanners open links in emails, so a GET only shows this button and the
 * POST it sends does the work.
 */
export function actionPage({
  title,
  message,
  action,
  token
}: {
  title: string
  message: string
  action: string
  token: string
}) {
  return page(
    title,
    html`<p>${message}</p>
      <form method="post">
        <input type="hidden" name="token" value="${token}" />
        <button type="submit">${action}</button>
      </form>`
  )
}
