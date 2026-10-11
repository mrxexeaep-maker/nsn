import { createFeedbackApp } from './app'
import { runRetention } from './retention'

const app = createFeedbackApp()

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runRetention(env, new Date()))
  }
} satisfies ExportedHandler<Env>
