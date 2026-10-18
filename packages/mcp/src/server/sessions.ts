import { randomUUID } from 'node:crypto'

import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import * as v from 'valibot'

import type { MCPAgentKind, MCPAgentSession, MCPToolSettled } from '#mcp/tool/registration'

export type MCPTransport = {
  handleRequest: (request: Request) => Promise<Response>
  close: () => Promise<void>
}

type MCPSession = {
  transport: MCPTransport
  server: McpServer
  lastSeen: number
  activeRequests: number
  initialized: boolean
}

type MCPSessionManagerOptions = {
  serverVersion: string
  registerTools: (
    server: McpServer,
    session: MCPAgentSession,
    onToolSettled: MCPToolSettled
  ) => void
  /** Told when a session ends, so the app stops showing its agent. */
  onSessionClosed?: (sessionId: string) => void
  /** Idle lifetime in ms; 0 disables expiration. Defaults to 15 minutes. */
  sessionIdleTimeoutMs?: number
}

const MAX_MCP_SESSIONS = 10
const MCP_SESSION_TTL_MS = 15 * 60_000
const SESSION_CLOSE_TIMEOUT_MS = 5_000

const InitializeResponse = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({ result: v.object({ protocolVersion: v.string() }) })
)

/**
 * Wraps a promise with a timeout. Resolves with undefined if the timeout
 * elapses before the promise settles. Used to prevent `transport.close()`
 * from hanging indefinitely — the MCP SDK's close() does not enforce a
 * timeout internally.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<T | undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms)
    })
  ])
}

async function closeSession(session: Pick<MCPSession, 'transport' | 'server'>): Promise<void> {
  try {
    await withTimeout(session.transport.close(), SESSION_CLOSE_TIMEOUT_MS)
  } catch {
    // Best-effort: the transport may already be closed or in a bad state
    process.stderr.write('  MCP session: transport close failed\n')
  }
  try {
    await withTimeout(session.server.close(), SESSION_CLOSE_TIMEOUT_MS)
  } catch {
    // Best-effort
    process.stderr.write('  MCP session: server close failed\n')
  }
}

export function createMCPSessionManager({
  serverVersion,
  registerTools,
  onSessionClosed,
  sessionIdleTimeoutMs = MCP_SESSION_TTL_MS
}: MCPSessionManagerOptions) {
  if (
    !Number.isSafeInteger(sessionIdleTimeoutMs) ||
    sessionIdleTimeoutMs < 0 ||
    sessionIdleTimeoutMs > 2_147_483_647
  ) {
    throw new Error('MCP session idle timeout must be an integer in 0–2147483647 ms')
  }
  const sessions = new Map<string, MCPSession>()
  const closing = new Map<string, Promise<void>>()

  function scheduleClose(session: MCPSession, id: string): Promise<void> {
    try {
      if (session.initialized) onSessionClosed?.(id)
    } catch {
      // Application notification must not prevent resource cleanup.
      process.stderr.write('  MCP session: close notification failed\n')
    }
    const task = closeSession(session).finally(() => closing.delete(id))
    closing.set(id, task)
    return task
  }

  function notifyToolsChanged() {
    for (const session of sessions.values()) {
      try {
        session.server.sendToolListChanged()
      } catch {
        continue
      }
    }
  }

  function cleanupExpired() {
    if (sessionIdleTimeoutMs === 0) return
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (session.activeRequests === 0 && now - session.lastSeen >= sessionIdleTimeoutMs) {
        sessions.delete(id)
        void scheduleClose(session, id)
      }
    }
  }

  const sweep =
    sessionIdleTimeoutMs > 0
      ? setInterval(cleanupExpired, Math.min(sessionIdleTimeoutMs, 60_000)).unref()
      : undefined

  const creating = new Map<string, Promise<MCPTransport>>()
  let closed = false

  async function createSession(id: string, kind: MCPAgentKind): Promise<MCPTransport> {
    if (closed) throw new Error('Session manager is closed')
    const inFlight = creating.get(id)
    if (inFlight) return inFlight

    const promise = (async () => {
      const server = new McpServer({ name: 'open-pencil', version: serverVersion })

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => id,
        enableJsonResponse: true
      })
      const sessionClosed = new AbortController()
      const pendingResponses = new WeakMap<Request, (response: Response) => void>()
      const onToolSettled: MCPToolSettled = async (context) => {
        const request = context.http?.req
        if (!request || !context.mcpReq.signal.aborted || sessionClosed.signal.aborted) return
        const respond = pendingResponses.get(request)
        if (!respond) return
        // The SDK suppresses cancelled results but leaves JSON HTTP promises
        // pending. End HTTP without a JSON-RPC response, then settle the SDK's
        // internal response to release its stream and request bookkeeping.
        respond(new Response(null, { status: 202 }))
        await transport
          .send({
            jsonrpc: '2.0',
            id: context.mcpReq.id,
            error: { code: -32800, message: 'Request cancelled' }
          })
          .catch(() => undefined)
      }
      // Connect the SDK before exposing its transport. The client's HTTP
      // InitializeRequest is processed later by handleRequest; connect() alone
      // does not establish a valid MCP session.
      try {
        registerTools(server, { id, kind }, onToolSettled)
        await server.connect(transport)
      } catch (e) {
        await closeSession({ transport, server })
        throw e
      }
      // `closed` is mutated by clear() which can run concurrently — TypeScript's
      // control-flow analysis can't track this cross-closure mutation.
      // oxlint-disable-next-line no-unnecessary-condition
      if (closed) {
        // Manager was closed while we were connecting — clean up immediately.
        await closeSession({ transport, server })
        throw new Error('Session manager closed during session creation')
      }
      const session: MCPSession = {
        server,
        lastSeen: Date.now(),
        activeRequests: 0,
        initialized: false,
        transport: {
          close: () => transport.close(),
          async handleRequest(request) {
            session.activeRequests++
            session.lastSeen = Date.now()
            let onClosed: (() => void) | undefined
            try {
              // SDK JSON response promises are not settled by close(). Do not
              // leave HTTP handlers waiting forever after DELETE or shutdown.
              const handling = transport.handleRequest(request)
              const response = await (request.method === 'POST'
                ? Promise.race([
                    handling,
                    new Promise<Response>((resolve) => {
                      pendingResponses.set(request, resolve)
                      onClosed = () =>
                        resolve(Response.json({ error: 'MCP session not found' }, { status: 404 }))
                      if (sessionClosed.signal.aborted) onClosed()
                      else sessionClosed.signal.addEventListener('abort', onClosed, { once: true })
                    })
                  ])
                : handling)
              if (!session.initialized) {
                // The SDK assigns an ID before validating InitializeRequest params.
                // HTTP 200 + a session header can therefore still be a JSON-RPC error.
                session.initialized =
                  response.ok &&
                  response.headers.get('mcp-session-id') === id &&
                  v.safeParse(InitializeResponse, await response.clone().text()).success
                if (!session.initialized) await deleteSession(id)
              }
              return response
            } catch (error) {
              if (!session.initialized) await deleteSession(id)
              throw error
            } finally {
              pendingResponses.delete(request)
              if (onClosed) sessionClosed.signal.removeEventListener('abort', onClosed)
              session.activeRequests--
              session.lastSeen = Date.now()
            }
          }
        }
      }
      // Preserve the SDK's protocol cleanup; only full transport closure ends
      // the session. Closing a GET/SSE connection does not invoke this callback.
      const onclose = transport.onclose
      transport.onclose = () => {
        sessionClosed.abort()
        try {
          onclose?.()
        } finally {
          void deleteSession(id)
        }
      }
      sessions.set(id, session)
      creating.delete(id)
      return session.transport
    })()

    creating.set(id, promise)
    try {
      return await promise
    } finally {
      creating.delete(id)
    }
  }

  function resolveTransport(
    sessionId: string | undefined,
    kind: MCPAgentKind = 'mcp'
  ): Promise<MCPTransport | { error: 'too_many' | 'closed' }> {
    if (closed) return Promise.resolve({ error: 'closed' })
    cleanupExpired()
    const existing = sessionId ? sessions.get(sessionId) : undefined
    if (existing) return Promise.resolve(existing.transport)
    // Reuse an in-flight creation for the same sessionId before enforcing the cap.
    if (sessionId) {
      const inFlight = creating.get(sessionId)
      if (inFlight) {
        // Wrap with the same catch as createSession so clear() during
        // in-flight creation returns { error: 'closed' } instead of throwing.
        return inFlight.catch((e) => {
          if (closed) return { error: 'closed' as const }
          throw e
        })
      }
    }
    if (sessions.size + creating.size + closing.size >= MAX_MCP_SESSIONS) {
      return Promise.resolve({ error: 'too_many' })
    }
    return createSession(sessionId ?? randomUUID(), kind).catch((e) => {
      // If the manager was closed during session creation, return the structured
      // error instead of letting the throw escape as a route-level 500.
      if (closed) return { error: 'closed' as const }
      throw e
    })
  }

  /**
   * Look up an existing session's transport without creating a new session.
   * Used for DELETE requests where creating a session just to delete it
   * would waste a session slot.
   */
  function getExistingTransport(
    sessionId: string | undefined
  ): MCPTransport | { error: 'not_found' | 'closed' } {
    if (closed) return { error: 'closed' }
    cleanupExpired()
    if (!sessionId) return { error: 'not_found' }
    const existing = sessions.get(sessionId)
    if (existing) return existing.transport
    return { error: 'not_found' }
  }

  async function deleteSession(sessionId: string | undefined): Promise<void> {
    if (closed) return
    if (!sessionId) return
    const session = sessions.get(sessionId)
    if (!session) return closing.get(sessionId)
    sessions.delete(sessionId)
    await scheduleClose(session, sessionId)
  }

  async function clear() {
    closed = true
    clearInterval(sweep)
    // Collect sessions before awaiting in-flight creations so new sessions
    // can't be added during shutdown.
    const all = [...sessions]
    sessions.clear()
    // Wait for in-flight session creations to finish (they will check
    // `closed` and clean up without storing the session).
    const inFlight = [...creating.values()]
    await Promise.allSettled(inFlight)
    creating.clear()
    // Await both previously-scheduled closes (from cleanupExpired/deleteSession)
    // and closes for sessions still alive at clear() time.
    await Promise.allSettled([
      ...closing.values(),
      ...all.map(([id, session]) => scheduleClose(session, id))
    ])
  }

  return { clear, deleteSession, getExistingTransport, notifyToolsChanged, resolveTransport }
}
