import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'

import type { MCPServerSetupState } from '@/app/ai/agents/setup'
import type { MCPFailure, MCPFailureCode } from '@/app/automation/mcp/failure'

import MCPFailureAlert from './MCPFailureAlert.vue'

/** One representative failure per reason, mirroring what each path records. */
const TIMEOUT_DETAIL = 'no health response from http://127.0.0.1:7600/health'

const reasons: Record<MCPFailureCode, MCPFailure> = {
  'not-installed': {
    code: 'not-installed',
    detail: '/opt/homebrew/bin, /usr/local/bin, /Users/you/.bun/bin'
  },
  outdated: { code: 'outdated', detail: '0.15.1' },
  'permission-denied': {
    code: 'permission-denied',
    detail: 'shell command openpencil-mcp-http not allowed by ACL'
  },
  exited: {
    code: 'exited',
    detail: 'Error: listen EADDRINUSE: address already in use 127.0.0.1:7600'
  },
  timeout: { code: 'timeout', detail: TIMEOUT_DETAIL },
  rejected: { code: 'rejected', detail: 'HTTP 401' },
  malformed: { code: 'malformed', detail: 'HTTP 200' },
  unreachable: { code: 'unreachable', detail: 'http://127.0.0.1:7600/mcp' },
  unknown: { code: 'unknown', detail: 'Failed to fetch' }
}

/** The desktop app with npm available, so one click installs or updates the server. */
const oneClick: MCPServerSetupState = {
  supported: true,
  checked: true,
  bridge: true,
  bridgeOutdated: true,
  bridgeCommand: 'npm i -g @open-pencil/mcp@0.16.0',
  npm: true,
  installingBridge: false,
  error: null
}

const meta = {
  title: 'App/Settings/MCP/Failure Alert',
  component: MCPFailureAlert,
  args: { failure: reasons.timeout, setup: oneClick },
  render: (args) => ({
    components: { MCPFailureAlert },
    setup: () => ({ args }),
    template: `
      <div class="max-w-xl bg-panel p-4 text-surface">
        <MCPFailureAlert
          :failure="args.failure"
          :setup="args.setup"
        />
      </div>`
  })
} satisfies Meta<{
  failure: MCPFailure
  setup: MCPServerSetupState
}>

export default meta
type Story = StoryObj<typeof meta>

export const StartupTimeout: Story = {}
export const NotInstalled: Story = { args: { failure: reasons['not-installed'] } }

/** An older server with npm available: one click updates it, with no commands to run. */
export const Outdated: Story = {
  args: { failure: reasons.outdated },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/The installed MCP server is v0\.15\.1/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Update MCP server' })).toBeVisible()
    await expect(canvas.queryByTestId('settings-mcp-install-command')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Copy prompt for your agent' })).toBeNull()
    // The running version is already in the guidance, so it is not repeated under Details.
    await expect(canvas.queryByRole('button', { name: 'Details' })).toBeNull()
  }
}

export const Updating: Story = {
  args: { failure: reasons.outdated, setup: { ...oneClick, installingBridge: true } }
}

/** Without npm the app cannot install, so the command and the agent prompt take over. */
export const NeedsNode: Story = {
  args: {
    failure: reasons['not-installed'],
    setup: { ...oneClick, bridge: false, bridgeOutdated: false, npm: false }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Install MCP server' })).toBeNull()
    await expect(canvas.getByRole('link', { name: 'Node.js' })).toBeVisible()
    await expect(canvas.getByTestId('settings-mcp-install-command')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Copy prompt for your agent' })).toBeVisible()
  }
}

/** A failed one-click install keeps the retry and adds the command to run by hand. */
export const InstallFailed: Story = {
  args: { failure: reasons.outdated, setup: { ...oneClick, error: 'canvas-install' } }
}

export const RejectedToken: Story = { args: { failure: reasons.rejected } }
export const Unreachable: Story = { args: { failure: reasons.unreachable } }

/** Every reason side by side: copy, guidance, and whether detail is offered. */
export const AllReasons: Story = {
  render: () => ({
    components: { MCPFailureAlert },
    setup: () => ({ failures: Object.values(reasons) }),
    template: `
      <div class="flex max-w-xl flex-col gap-3 bg-panel p-4 text-surface">
        <MCPFailureAlert v-for="failure in failures" :key="failure.code" :failure="failure" />
      </div>`
  })
}

export const DetailsExpandOnDemand: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Collapsed payloads stay unmounted, so the alert announces only its summary.
    await expect(canvas.queryByText(TIMEOUT_DETAIL)).toBeNull()
    const trigger = canvas.getByRole('button', { name: 'Details' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger)
    await expect(canvas.getByText(TIMEOUT_DETAIL)).toBeVisible()
  }
}
