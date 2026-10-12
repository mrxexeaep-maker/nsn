<script setup lang="ts">
import { useElementSize, useRafFn, watchDebounced } from '@vueuse/core'
import type { createRendererFromJSON } from 'shaders/core'
import { onMounted, onScopeDispose, useTemplateRef } from 'vue'

import type { ShaderPreset } from '@open-pencil/scene-graph'

import { canDrawShaders } from '#vue/canvas/surface/shader-rasterizer'

/**
 * A shader fill playing behind an island layer's content: its still frame at once, and over
 * it, where the browser has WebGPU, the preset on a canvas the layer's size. The layer is
 * positioned and isolated by the projection, so this sits under everything it holds.
 */
const { preset, frame } = defineProps<{
  preset: ShaderPreset
  /** The still frame the document keeps, shown until the shader plays and where it cannot. */
  frame?: string
}>()

/** How long the layer must keep its size before the shader is drawn at the new size. */
const RESIZE_DEBOUNCE_MS = 150

const host = useTemplateRef<HTMLElement>('host')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const { width, height } = useElementSize(host)
const playable = canDrawShaders()

let renderer: ReturnType<typeof createRendererFromJSON> | null = null
/** Bumped by every start, so a renderer that finishes loading late is let go. */
let generation = 0
let drawnAt = 0
let drawing = false

const { pause, resume } = useRafFn(
  async ({ timestamp }) => {
    if (!renderer || drawing) return
    drawing = true
    try {
      const delta = drawnAt === 0 ? 0 : (timestamp - drawnAt) / 1000
      drawnAt = timestamp
      await renderer.renderFrame({ deltaSeconds: delta, waitForGpu: false })
    } finally {
      drawing = false
    }
  },
  { immediate: false }
)

function stop() {
  pause()
  renderer?.dispose()
  renderer = null
}

async function start() {
  const current = ++generation
  stop()
  const target = canvas.value
  if (!playable || !target || width.value < 1 || height.value < 1) return
  // The renderer sizes its buffer at the device pixel ratio itself.
  target.width = Math.max(1, Math.round(width.value))
  target.height = Math.max(1, Math.round(height.value))
  const shaders = await import('shaders/core')
  if (current !== generation) return
  const created = shaders.createRendererFromJSON(structuredClone(preset))
  try {
    await created.initialize(target)
  } catch (error) {
    // The still frame under the canvas stays.
    console.warn('Could not play a shader', error)
    created.dispose()
    return
  }
  if (current !== generation) {
    created.dispose()
    return
  }
  renderer = created
  drawnAt = 0
  resume()
}

onMounted(start)
watchDebounced([width, height, () => JSON.stringify(preset)], start, {
  debounce: RESIZE_DEBOUNCE_MS
})
onScopeDispose(() => {
  generation++
  stop()
})
</script>

<template>
  <div
    ref="host"
    aria-hidden="true"
    style="position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none"
  >
    <img
      v-if="frame"
      :src="frame"
      alt=""
      style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"
    />
    <canvas
      v-if="playable"
      ref="canvas"
      style="position: absolute; inset: 0; width: 100%; height: 100%; display: block"
    />
  </div>
</template>
