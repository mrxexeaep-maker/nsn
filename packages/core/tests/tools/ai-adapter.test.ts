import { describe, expect, spyOn, test } from 'bun:test'

import { toolModelMessageSchema } from 'ai'
import * as v from 'valibot'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import {
  defineTool,
  toolsToAI,
  type ToolImageUploader,
  type ToolLogEntry
} from '@open-pencil/core/tools'
import { SceneGraph } from '@open-pencil/scene-graph'

type ToolFactory = Parameters<typeof toolsToAI>[2]['tool']

// The adapter only forwards definitions to the factory; an identity factory exposes them.
const tool = ((definition: unknown) => definition) as ToolFactory

type ModelOutputTool = {
  toModelOutput(options: { output: unknown }): unknown
}

function adapt(output: unknown): ModelOutputTool {
  const def = defineTool({
    name: 'image_tool',
    description: 'Returns a fixed result',
    execution: { kind: 'sync', mutation: 'none' },
    input: v.strictObject({}),
    execute: () => output
  })
  const figma = new FigmaAPI(new SceneGraph())
  const tools = toolsToAI([def], { getFigma: () => figma }, { tool })
  const adapted: unknown = tools.image_tool
  if (!hasModelOutput(adapted)) throw new Error('image_tool has no toModelOutput')
  return adapted
}

function hasModelOutput(value: unknown): value is ModelOutputTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toModelOutput' in value &&
    typeof value.toModelOutput === 'function'
  )
}

describe('AI adapter model output', () => {
  test('sends any image result as a file with its metadata as text', () => {
    const output = { mimeType: 'image/png', base64: 'AAAA', changedPixels: 12 }
    expect(adapt(output).toModelOutput({ output })).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: '{"changedPixels":12}' },
        { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'AAAA' } }
      ]
    })
  })

  test.each([
    { mimeType: 'image/png', base64: 'AAAA', changedPixels: 12 },
    { mimeType: 'image/png', base64: 'AAAA' },
    { mimeType: 'application/pdf', base64: 'AAAA' }
  ])('produces a tool message the AI SDK accepts in the next prompt (%p)', (output) => {
    const message = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'image_tool',
          output: adapt(output).toModelOutput({ output })
        }
      ]
    }
    expect(toolModelMessageSchema.safeParse(message).success).toBe(true)
  })

  test('keeps non-image results as JSON', () => {
    const output = { mimeType: 'application/pdf', base64: 'AAAA' }
    expect(adapt(output).toModelOutput({ output })).toEqual({ type: 'json', value: output })
  })
})

type ExecutableTool = {
  execute(args: Record<string, unknown>, options: { toolCallId: string }): Promise<unknown>
}

function hasExecute(value: unknown): value is ExecutableTool {
  return (
    typeof value === 'object' &&
    value !== null &&
    'execute' in value &&
    typeof value.execute === 'function'
  )
}

async function runLogged(execute: () => unknown) {
  const def = defineTool({
    name: 'logged_tool',
    description: 'Runs the given body',
    execution: { kind: 'sync', mutation: 'none' },
    input: v.strictObject({}),
    execute
  })
  const figma = new FigmaAPI(new SceneGraph())
  const entries: ToolLogEntry[] = []
  const tools = toolsToAI(
    [def],
    { getFigma: () => figma, onToolLog: (entry) => entries.push(entry) },
    { tool }
  )
  const adapted: unknown = tools.logged_tool
  if (!hasExecute(adapted)) throw new Error('logged_tool has no execute')
  const result = await adapted.execute({}, { toolCallId: 'call' })
  return { result, entries }
}

describe('AI adapter tool log', () => {
  test('gives the model the message and the log what was thrown', async () => {
    const thrown = new TypeError('stops.map is not a function')
    const { result, entries } = await runLogged(() => {
      throw thrown
    })
    expect(result).toEqual({ error: 'stops.map is not a function' })
    expect(entries).toMatchObject([{ error: 'stops.map is not a function', cause: thrown }])
  })

  test('logs a returned error as a failure, like a thrown one', async () => {
    const { entries } = await runLogged(() => ({
      id: '999:999',
      error: 'Node "999:999" not found'
    }))
    expect(entries).toMatchObject([{ error: 'Node "999:999" not found', cause: undefined }])
  })

  test('logs a result without an error as a success', async () => {
    const { entries } = await runLogged(() => ({ id: '1:2', name: 'Card' }))
    expect(entries[0]?.error).toBeUndefined()
  })
})

const IMAGE = { mimeType: 'image/png', base64: 'AAAA', width: 2 }
const REFERENCE = { anthropic: 'file_1' }

function adaptImageTool(output: unknown, imageUploader?: ToolImageUploader) {
  const def = defineTool({
    name: 'image_tool',
    description: 'Returns a fixed result',
    execution: { kind: 'sync', mutation: 'none' },
    input: v.strictObject({}),
    execute: () => output
  })
  const figma = new FigmaAPI(new SceneGraph())
  const tools = toolsToAI([def], { getFigma: () => figma, imageUploader }, { tool })
  const adapted: unknown = tools.image_tool
  if (!hasExecute(adapted) || !hasModelOutput(adapted)) throw new Error('image_tool is incomplete')
  return adapted
}

describe('AI adapter image uploads', () => {
  test('uploads an image result once and sends its reference on every later step', async () => {
    const uploads: Array<{ data: string; mediaType: string }> = []
    const imageTool = adaptImageTool(IMAGE, {
      scope: 'connection',
      upload: async (image) => {
        uploads.push(image)
        return { reference: REFERENCE }
      }
    })
    const output = await imageTool.execute({}, { toolCallId: 'call' })
    const byReference = {
      type: 'content',
      value: [
        { type: 'text', text: '{"width":2}' },
        { type: 'file', mediaType: 'image/png', data: { type: 'reference', reference: REFERENCE } }
      ]
    }
    expect(imageTool.toModelOutput({ output })).toEqual(byReference)
    expect(imageTool.toModelOutput({ output })).toEqual(byReference)
    expect(uploads).toEqual([{ data: 'AAAA', mediaType: 'image/png' }])
    expect(output).toMatchObject(IMAGE)
  })

  test('sends an image as data when this chat cannot read its reference', async () => {
    const output = await adaptImageTool(IMAGE, {
      scope: 'connection',
      upload: async () => ({ reference: REFERENCE })
    }).execute({}, { toolCallId: 'call' })
    const asData = {
      type: 'content',
      value: [
        { type: 'text', text: '{"width":2}' },
        { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'AAAA' } }
      ]
    }
    const otherConnection = { scope: 'other-connection', upload: async () => ({ reference: REFERENCE }) }
    expect(adaptImageTool(IMAGE, otherConnection).toModelOutput({ output })).toEqual(asData)
    expect(adaptImageTool(IMAGE).toModelOutput({ output })).toEqual(asData)
  })

  test('keeps the image as data when its upload fails, and the call succeeds', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const imageTool = adaptImageTool(IMAGE, {
        scope: 'connection',
        upload: async () => {
          throw new Error('files API unavailable')
        }
      })
      const output = await imageTool.execute({}, { toolCallId: 'call' })
      expect(output).toEqual(IMAGE)
      expect(imageTool.toModelOutput({ output })).toMatchObject({
        value: [{}, { data: { type: 'data', data: 'AAAA' } }]
      })
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  test('uploads only images', async () => {
    const pdf = { mimeType: 'application/pdf', base64: 'AAAA' }
    let uploads = 0
    const output = await adaptImageTool(pdf, {
      scope: 'connection',
      upload: async () => {
        uploads++
        return { reference: REFERENCE }
      }
    }).execute({}, { toolCallId: 'call' })
    expect(output).toEqual(pdf)
    expect(uploads).toBe(0)
  })

  test('produces a referenced image the AI SDK accepts in the next prompt', async () => {
    const imageTool = adaptImageTool(IMAGE, { scope: 'connection', upload: async () => ({ reference: REFERENCE }) })
    const output = await imageTool.execute({}, { toolCallId: 'call' })
    const message = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call',
          toolName: 'image_tool',
          output: imageTool.toModelOutput({ output })
        }
      ]
    }
    expect(toolModelMessageSchema.safeParse(message).success).toBe(true)
  })
})
