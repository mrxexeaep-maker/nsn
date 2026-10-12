/**
 * The page `drawShaderStills` opens in a browser: it draws a shader preset's first frame on a
 * WebGPU canvas and hands it back as a PNG data URL. Bundled for the browser at build time.
 */
import { createRendererFromJSON } from 'shaders/core'

import type { ShaderPreset } from '@open-pencil/scene-graph'

export interface ShaderStillPage {
  renderStill(preset: ShaderPreset, width: number, height: number): Promise<string>
}

const page: ShaderStillPage = {
  async renderStill(preset, width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const renderer = createRendererFromJSON(structuredClone(preset))
    try {
      await renderer.initialize(canvas)
      // The first frame only prepares the effects' pipelines; the second is the still.
      await renderer.renderFrame({ deltaSeconds: 0, waitForGpu: false })
      await renderer.renderFrame({ deltaSeconds: 0, waitForGpu: false })
      return canvas.toDataURL('image/png')
    } finally {
      renderer.dispose()
    }
  }
}

Object.assign(window, { shaderStill: page })
