<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger
} from 'reka-ui'

import {
  editorCommandMetadata,
  formatShortcut,
  useEditorCommands,
  type EditorCommandId
} from '@open-pencil/vue/editor/commands'
import { useI18n } from '@open-pencil/vue/i18n'
import { useRetainedPopup } from '@open-pencil/vue/lifecycle/retention'

import IconButton from '@/components/ui/button/IconButton.vue'
import { menuItem, useMenuUI } from '@/components/ui/menu/menu'
import MenuScrollArea from '@/components/ui/menu/MenuScrollArea.vue'

const { getCommand, runCommand } = useEditorCommands()
const { panels } = useI18n()
const { open: popupOpen, portalActive } = useRetainedPopup()

// Figma's alignment row offers these three, in this order.
const actions = [
  'selection.tidyUp',
  'selection.distributeVertical',
  'selection.distributeHorizontal'
] satisfies EditorCommandId[]

const menuCls = useMenuUI({ content: 'min-w-56' })
const itemCls = menuItem({ justify: 'between' })
</script>

<template>
  <DropdownMenuRoot v-model:open="popupOpen">
    <DropdownMenuTrigger as-child>
      <IconButton
        :label="panels.moreAlignmentActions"
        size="xs"
        data-test-id="alignment-more-actions"
      >
        <icon-lucide-ellipsis class="size-3.5" />
      </IconButton>
    </DropdownMenuTrigger>
    <DropdownMenuPortal v-if="portalActive">
      <DropdownMenuContent align="end" side="bottom" :side-offset="4" :class="menuCls.content">
        <MenuScrollArea>
          <DropdownMenuItem
            v-for="id in actions"
            :key="id"
            :data-test-id="`alignment-action-${id.replace('selection.', '')}`"
            :class="itemCls"
            :disabled="!getCommand(id).enabled.value"
            @select="runCommand(id)"
          >
            <span>{{ getCommand(id).label }}</span>
            <span class="ml-6 text-[11px] text-muted">{{
              formatShortcut(editorCommandMetadata(id).shortcut)
            }}</span>
          </DropdownMenuItem>
        </MenuScrollArea>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
