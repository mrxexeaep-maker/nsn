<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { compact } from 'es-toolkit/array'
import { computed, ref } from 'vue'

import { useAutomationMessages, useI18n } from '@open-pencil/vue'

import {
  MCP_INSTALL_COMMAND,
  MCP_INSTALL_TARGET,
  type MCPFailure,
  type MCPFailureCode
} from '@/app/automation/mcp/failure'
import { mcpServerSetupPrompt, needsMCPInstall } from '@/app/automation/mcp/setup-prompt'
import { toast } from '@/app/shell/ui'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppCollapsible from '@/components/ui/collapsible/AppCollapsible.vue'
import AppAlert from '@/components/ui/feedback/AppAlert.vue'
import AppCopyField from '@/components/ui/input/AppCopyField.vue'

const {
  failure,
  restarting = false,
  externallyManaged = false
} = defineProps<{
  failure: MCPFailure
  restarting?: boolean
  externallyManaged?: boolean
}>()
const emit = defineEmits<{ restart: [] }>()

const automation = useAutomationMessages()
const { common } = useI18n()
const { copy } = useClipboard()
const { copy: copyPrompt, copied: promptCopied } = useClipboard({ copiedDuring: 1500 })
const detailsOpen = ref(false)
const install = computed(() => needsMCPInstall(failure))

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
        package: MCP_INSTALL_TARGET
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
    <template v-if="install || detail" #details>
      <AppCopyField
        v-if="install"
        :value="MCP_INSTALL_COMMAND"
        :copy-label="common.copy"
        :copied-label="common.copied"
        data-test-id="settings-mcp-install-command"
      />
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
        v-if="install"
        size="xs"
        color="primary"
        variant="solid"
        data-test-id="settings-mcp-copy-agent-prompt"
        @click="copyPrompt(mcpServerSetupPrompt(failure))"
      >
        <template #leading><icon-lucide-clipboard-copy class="size-3" /></template>
        {{ promptCopied ? common.copied : automation.mcpCopyAgentPrompt }}
      </AppButton>
      <AppButton size="xs" variant="outline" @click="copyDetails">{{
        automation.mcpFailureCopy
      }}</AppButton>
      <AppButton
        size="xs"
        variant="outline"
        :disabled="externallyManaged"
        :loading="restarting"
        @click="emit('restart')"
        >{{ externallyManaged ? automation.externallyManaged : automation.restart }}</AppButton
      >
    </template>
  </AppAlert>
</template>
