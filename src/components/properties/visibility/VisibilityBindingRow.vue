<script setup lang="ts">
import { computed } from 'vue'

import { variableText } from '@open-pencil/scene-graph'
import {
  BindableValueRoot,
  useEditor,
  useI18n,
  useVisibilityBindingProvider
} from '@open-pencil/vue'

import IconButton from '@/components/ui/button/IconButton.vue'
import PanelFieldGroup from '@/components/ui/panel/PanelFieldGroup.vue'
import { VARIABLE_TYPE_ICONS } from '@/components/variables/type-icons'

/**
 * The variable a layer's visibility follows, laid out as a bound component property is: the
 * field it decides, the variable with its value here, and a way to let go of it.
 */
const { nodeId } = defineProps<{ nodeId: string }>()

const editor = useEditor()
const { panels } = useI18n()
const provider = useVisibilityBindingProvider()
const targets = computed(() => [{ nodeId, path: 'visible' }])

function valueText(variableId: string) {
  return variableText(editor.graph.resolveVariableForNode(nodeId, variableId))
}
</script>

<template>
  <BindableValueRoot v-slot="binding" :provider="provider" :targets="targets" :value="true">
    <PanelFieldGroup
      v-if="binding.state !== 'unbound'"
      class="mb-1.5"
      :label="panels.layerVisibility"
    >
      <div class="flex min-w-0 flex-1 items-center gap-1" data-visibility-bound>
        <span
          class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded bg-input px-2 text-xs text-surface"
          :class="binding.state === 'unresolved' && 'bg-error-bg text-error'"
        >
          <component
            :is="VARIABLE_TYPE_ICONS[binding.variable?.type ?? 'BOOLEAN']"
            class="size-3.5 shrink-0 text-muted"
            aria-hidden="true"
          />
          <span class="truncate">
            {{ binding.variable?.name ?? binding.bindingId ?? panels.unresolvedVariable }}
          </span>
          <span v-if="binding.variable" class="ml-auto shrink-0 truncate text-muted">
            {{ valueText(binding.variable.id) }}
          </span>
        </span>
        <IconButton :label="panels.detachVariable" @click="binding.actions.unbind()">
          <icon-lucide-unlink class="size-3.5" />
        </IconButton>
      </div>
    </PanelFieldGroup>
  </BindableValueRoot>
</template>
