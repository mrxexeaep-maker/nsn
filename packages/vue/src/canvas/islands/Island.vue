<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'

import { resolvePlayState } from '@open-pencil/core/editor'
import { vectorElement } from '@open-pencil/core/io'
import {
  behaviourControls,
  controlRoles,
  sceneNodeToDesignDocument,
  tokenStylesheet
} from '@open-pencil/dom-css/export'

import { useEditor } from '#vue/editor/context'

import { renderNode } from './render'
import { useShadowContainer } from './shadow'
import { createIslandState, instanceStates } from './state'

/**
 * One live island: a top-level layer that holds controls, rendered as DOM in its own shadow
 * root, with each control running as its Reka UI component. The design's variants draw the
 * controls' states; the document never changes.
 */
const { rootId, revision } = defineProps<{
  rootId: string
  /** Changing it starts every control again as designed. */
  revision: number
}>()
const editor = useEditor()

/** Styles of the island's own document; the app's styles do not reach into it. */
const ISLAND_CSS = ':host{all:initial;display:block}*,*::before,*::after{box-sizing:border-box}'
/**
 * The document's variables as custom properties, which the projection's `var()` references
 * read, in the modes the island's layers set. The island is a shadow root, so the stylesheet's
 * `:root` becomes its host.
 */
const tokensCSS = computedAsync(async () => {
  void editor.state.sceneVersion
  const { css } = await tokenStylesheet(editor.graph, { format: 'css' })
  return css.replaceAll(':root', ':host')
}, '')
const container = useShadowContainer(
  useTemplateRef<HTMLElement>('host'),
  () => `${ISLAND_CSS}${tokensCSS.value}`
)

const controls = computed(() => {
  void editor.state.sceneVersion
  return behaviourControls(editor.graph, rootId)
})
const roles = computed(() => controlRoles(controls.value))
const state = shallowRef(createIslandState(controls.value))
watch(
  () => [rootId, revision, [...controls.value.keys()].join('\n')],
  () => (state.value = createIslandState(controls.value))
)

const projection = computed(() => {
  void editor.state.sceneVersion
  const graph = resolvePlayState(editor.graph, rootId, instanceStates(controls.value, state.value))
  const [root] = sceneNodeToDesignDocument(graph, rootId, { vectorElement }).children
  return { graph, root }
})

/** The island's layers, rendered from the projection of their current states. */
function Layers() {
  const { graph, root } = projection.value
  return root
    ? renderNode(
        { graph, rootId, controls: controls.value, roles: roles.value, state: state.value },
        root,
        ''
      )
    : null
}
</script>

<template>
  <div ref="host" :data-island="rootId">
    <Teleport v-if="container" :to="container">
      <Layers />
    </Teleport>
  </div>
</template>
