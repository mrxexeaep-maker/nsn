# @open-pencil/mcp

Model Context Protocol server for [OpenPencil](https://openpencil.dev). It lets MCP clients such as Claude Code, Cursor, and Windsurf inspect and edit designs through the running app, reusing the same tool definitions as the built-in AI chat.

```sh
npm install -g @open-pencil/mcp
openpencil-mcp        # stdio transport for MCP clients
openpencil-mcp-http   # Streamable HTTP transport for browser extensions and scripts
```

On macOS and Linux, local clients prefer a private Unix domain socket; Windows and unavailable sockets fall back to localhost TCP. File access is limited to the effective MCP root.

Streamable HTTP requires initialization by POST before opening GET/SSE with the returned `Mcp-Session-Id`. Closing an SSE connection preserves the session; DELETE explicitly ends it. The server supports 10 concurrent sessions, including pending creation and resource cleanup. Failed initialization releases its slot.

Idle sessions expire after 15 minutes, with a background sweep at most one minute later. Set `OPENPENCIL_MCP_SESSION_IDLE_TIMEOUT_MS` (or the `sessionIdleTimeoutMs` server option) to change this lifetime; `0` disables expiration. Pending requests are protected and the idle clock restarts when they complete, including when their HTTP client disconnects. An open GET/SSE stream alone does not prevent expiration: passive clients can send MCP pings to retain their session. Expired session IDs return 404 and require initialization again.

Explicitly cancelled tools stay protected until their execution settles, then release their pending HTTP resources without sending a JSON-RPC result.

- Setup and client configuration: https://openpencil.dev/programmable/mcp-server
- Source and issues: https://github.com/open-pencil/open-pencil

MIT License.
