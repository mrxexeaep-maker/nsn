import { createApp } from 'vue'

import '@/app.css'
import MetricsView from '@/views/metrics/MetricsView.vue'

// Entry for the team's metrics dashboard (`metrics.html`). Only the feedback Worker serves it,
// under /admin behind Cloudflare Access; the editor never loads it.
const app = createApp(MetricsView)
app.config.errorHandler = (error) => {
  console.error(error)
}
app.mount('#app')
