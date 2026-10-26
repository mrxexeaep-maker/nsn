/**
 * The sandbox frame's script (`document.ts`): runs each request from the host in a fresh worker
 * and reports its result. The frame has an opaque origin, so it starts the worker from its
 * bundled source rather than a URL of the app.
 */
import workerSource from './worker/index.ts?script'
import type { SandboxRunRequest } from './worker/run'

const workerURL = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))

function isRunRequest(value: unknown): value is { type: string } & SandboxRunRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'open-pencil-design-jsx-run' &&
    'id' in value &&
    typeof value.id === 'string'
  )
}

addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data
  if (!isRunRequest(message)) return
  const { type: _type, ...request } = message
  const worker = new Worker(workerURL)
  worker.onmessage = ({ data }: MessageEvent<object>) => {
    parent.postMessage({ type: 'open-pencil-design-jsx-result', ...data }, '*')
    worker.terminate()
  }
  worker.onerror = () => {
    const error = 'Design JSX execution failed.'
    parent.postMessage(
      { type: 'open-pencil-design-jsx-result', id: request.id, ok: false, error },
      '*'
    )
    worker.terminate()
  }
  worker.postMessage(request)
})
parent.postMessage({ type: 'open-pencil-design-jsx-ready' }, '*')
