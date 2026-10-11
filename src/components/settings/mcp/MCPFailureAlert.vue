<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { compact } from 'es-toolkit/array'
import { computed, ref } from 'vue'

import { useAutomationMessages, useI18n } from '@open-pencil/vue'

import { mcpServerSetupView, type MCPServerSetupState } from '@/app/ai/agents/setup'
import { type MCPFailure, type MCPFailureCode } from '@/app/automation/mcp/failure'
import { mcpServerSetupPrompt, needsMCPInstall } from '@/app/automation/mcp/setup-prompt'
import { APP_VERSION } from '@/app/runtime/version'
import { toast } from '@/app/shell/ui'
import { useSetupProblemMessage } from '@/components/settings/agents/problem'
import SettingsLink from '@/components/settings/layout/SettingsLink.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppCollapsible from '@/components/ui/collapsible/AppCollapsible.vue'
import AppAlert from '@/components/ui/feedback/AppAlert.vue'
import AppCopyField from '@/components/ui/input/AppCopyField.vue'
import { NODE_DOWNLOAD_URL } from '@/constants'

/** Where one-click installation is unavailable, only the manual fallback applies. */
const MANUAL_SETUP: MCPServerSetupState = {
  supported: false,
  checked: true,
  bridge: false,
  bridgeOutdated: false,
  bridgeCommand: '',
  npm: false,
  installingBridge: false,
  error: null
}

// Restart lives in the Local server section header, so the alert carries only fixes.
const { failure, setup } = defineProps<{
  failure: MCPFailure
  /** The MCP server's install state, for one-click installation on the desktop. */
  setup?: MCPServerSetupState
}>()
const emit = defineEmits<{ install: [] }>()

const automation = useAutomationMessages()
const { ai, common } = useI18n()
const setupProblemMessage = useSetupProblemMessage()
const { copy } = useClipboard()
const { copy: copyPrompt, copied: promptCopied } = useClipboard({ copiedDuring: 1500 })
const detailsOpen = ref(false)

/** One-click install or update first; a command and an agent prompt only where it cannot help. */
const installView = computed(() =>
  needsMCPInstall(failure) ? mcpServerSetupView(setup ?? MANUAL_SETUP) : null
)
const installAction = computed(() => {
  const bridge = installView.value?.bridge
  if (!bridge?.action) return null
  if (bridge.installing) return ai.value.aiSetupAgentInstalling
  return bridge.action === 'update'
    ? ai.value.aiSetupAgentUpdateMCP
    : ai.value.aiSetupAgentInstallMCP
})
const problem = computed(() => installView.value?.problem ?? null)
const manualCommand = computed(() => installView.value?.manualCommand ?? null)

/** Translated copy for each reason; the technical detail stays secondary. */
const copy$ = computed(() => {
  const messages = automation.value
  const map: Record<MCPFailureCode, { heading: string; description: string }> = {
    'not-installed': {
      heading: messages.mcpFailureNotInstalled,
      description: messages.mcpFailureNotInstalledHint
    },
    outdated: {
      heading: messages.mcpFailureOutdated,
      description: messages.mcpFailureOutdatedHint({
        running: failure.detail ? `v${failure.detail}` : 'an older version',
        version: `v${APP_VERSION}`
      })
    },
    'permission-denied': {
      heading: messages.mcpFailurePermission,
      description: messages.mcpFailurePermissionHint
    },
    exited: { heading: messages.mcpFailureExited, description: messages.mcpFailureExitedHint },
    timeout: { heading: messages.mcpFailureTimeout, description: messages.mcpFailureTimeoutHint },
    rejected: {
      heading: messages.mcpFailureRejected,
      description: messages.mcpFailureRejectedHint
    },
    malformed: {
      heading: messages.mcpFailureMalformed,
      description: messages.mcpFailureMalformedHint
    },
    unreachable: {
      heading: messages.mcpFailureUnreachable,
      description: messages.mcpFailureUnreachableHint({
        endpoint: failure.detail ?? 'the local server'
      })
    },
    unknown: { heading: messages.mcpFailureUnknown, description: messages.mcpFailureUnknownHint }
  }
  return map[failure.code]
})

/**
 * Reasons whose cause already appears in the guidance, so repeating the same
 * value under Details would only add noise.
 */
const EXPLAINED_REASONS: ReadonlySet<MCPFailureCode> = new Set([
  'outdated',
  'rejected',
  'unreachable'
])

const detail = computed(() =>
  EXPLAINED_REASONS.has(failure.code) ? null : failure.detail?.trim() || null
)

async function copyDetails(): Promise<void> {
  const payload = compact([
    `code=${failure.code}`,
    failure.detail ? `detail=${failure.detail}` : null
  ]).join('\n')
  // VueUse falls back to a legacy write and never rejects, so awaiting the write
  // is what keeps the confirmation honest.
  await copy(payload)
  toast.info(automation.value.mcpFailureCopied)
}
</script>

<template>
  <AppAlert
    tone="error"
    :heading="copy$.heading"
    :description="copy$.description"
    data-test-id="settings-mcp-failure"
  >
    <template v-if="problem || manualCommand || detail" #details>
      <p v-if="problem" data-test-id="settings-mcp-install-problem">
        {{ setupProblemMessage(problem) }}
        <SettingsLink v-if="problem === 'needs-npm'" :href="NODE_DOWNLOAD_URL"
          >Node.js</SettingsLink
        >
      </p>
      <template v-if="manualCommand">
        <p>{{ automation.mcpInstallByHand }}</p>
        <AppCopyField
          :value="manualCommand"
          :copy-label="common.copy"
          :copied-label="common.copied"
          data-test-id="settings-mcp-install-command"
        />
      </template>
      <AppCollapsible
        v-if="detail"
        v-model:open="detailsOpen"
        :label="automation.mcpFailureDetails"
        :ui="{ trigger: 'text-muted hover:text-surface', content: 'mt-1' }"
        data-test-id="settings-mcp-failure-details"
      >
        <pre
          class="max-h-40 overflow-auto rounded border border-border bg-input p-2 font-mono text-[11px] whitespace-pre-wrap text-muted"
          data-test-id="settings-mcp-failure-detail"
          >{{ detail }}</pre>
      </AppCollapsible>
    </template>
    <template #actions>
      <AppButton
        v-if="installAction"
        size="xs"
        color="primary"
        variant="solid"
        :loading="installView?.bridge.installing"
        data-test-id="settings-mcp-install"
        @click="emit('install')"
        >{{ installAction }}</AppButton
      >
      <AppButton
        v-else-if="manualCommand"
        size="xs"
        color="primary"
        variant="solid"
        data-test-id="settings-mcp-copy-agent-prompt"
        @click="copyPrompt(mcpServerSetupPrompt(failure, manualCommand))"
      >
        <template #leading><icon-lucide-clipboard-copy class="size-3" /></template>
        {{ promptCopied ? common.copied : automation.mcpCopyAgentPrompt }}
      </AppButton>
      <AppButton size="xs" variant="outline" @click="copyDetails">{{
        automation.mcpFailureCopy
      }}</AppButton>
    </template>
  </AppAlert>
</template>
