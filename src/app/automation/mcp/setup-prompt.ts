import dedent from 'dedent'

import { APP_VERSION } from '@/app/runtime/version'

import { MCP_INSTALL_COMMAND, MCP_INSTALL_TARGET, type MCPFailure } from './failure'

/** Reasons the person can fix by installing the MCP server at this app's version. */
export function needsMCPInstall(failure: MCPFailure): boolean {
  return failure.code === 'not-installed' || failure.code === 'outdated'
}

/**
 * Markdown to paste into the agent the person connects over MCP, asking it to install the
 * server that matches this app. Written for the agent, so it stays in English.
 */
export function mcpServerSetupPrompt(failure: MCPFailure): string {
  const found =
    failure.code === 'outdated'
      ? `OpenPencil found version ${failure.detail ?? 'an older version'} installed, which does not match the app.`
      : 'OpenPencil could not find the `openpencil-mcp-http` command.'
  return dedent`
    Help me set up OpenPencil's MCP server so you can work on my designs in OpenPencil, an open-source design editor. The desktop app reaches agents through this local server. It runs on Node.js and installs separately from npm, so the app does not ship its own JavaScript runtime. ${found}

    Please do this for me:

    1. Install the version that matches my app: \`${MCP_INSTALL_COMMAND}\`. If I installed OpenPencil's MCP server with Bun before, run \`bun add -g ${MCP_INSTALL_TARGET}\` instead. If Node.js is missing, tell me how to install it.
    2. Confirm that \`openpencil-mcp-http --version\` prints ${APP_VERSION}. If the command is not found, check that the global npm or Bun folder is on my PATH and tell me how to add it.

    Then tell me what you did. I will press "Restart MCP server" in OpenPencil's Settings → MCP afterwards.
  `
}
