import { describe, expect, test } from 'bun:test'

import type { LanguageModel } from 'ai'
import { fromUint8Array } from 'js-base64'

import { AI_PROVIDERS } from '@open-pencil/core/constants'
import type { AIProviderID } from '@open-pencil/core/constants'

import { createToolImageUploader, resolveLanguageModelID } from '@/app/ai/models/language-model'
import { resolveProviderModel } from '@/app/ai/models/reasoning/floors'
import { reasoningCallSettings } from '@/app/ai/models/reasoning/settings'
import type { ThinkingLevel } from '@/app/ai/models/types'
import { createAnthropicCompatibleAdapter } from '@/app/ai/providers/compatible'
import { modelProviderAdapter } from '@/app/ai/providers/registry'
import type { ModelConfig } from '@/app/ai/providers/types'
import type { FetchFunction } from '@/app/http/types'

import { expectDefined } from '#tests/helpers/assert'

function languageModelInstance(model: LanguageModel): Exclude<LanguageModel, string> {
  if (typeof model === 'string') throw new Error(`Expected a model instance, got ${model}`)
  return model
}

/** The JSON body a curated model sends at a thinking level, with its reasoning floor applied. */
async function thinkingRequestBody(
  providerID: AIProviderID,
  modelID: string,
  level: ThinkingLevel
): Promise<unknown> {
  let requestBody = ''
  const fetchSpy: FetchFunction = async (_input, init) => {
    requestBody = String(init?.body)
    throw new Error('stop')
  }
  const model = languageModelInstance(
    modelProviderAdapter(providerID).create(
      {
        providerID,
        apiKey: 'test-key',
        modelID,
        customModelID: '',
        customBaseURL: '',
        customAPIType: 'completions'
      },
      { fetch: fetchSpy }
    )
  )
  const known = await resolveProviderModel(providerID, modelID)
  await Promise.resolve(
    model.doGenerate({
      ...reasoningCallSettings(providerID, level, known?.minReasoningEffort),
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    })
  ).catch(() => undefined)
  return JSON.parse(requestBody)
}

describe('resolveLanguageModelID', () => {
  test('uses the selected OpenRouter model when no custom model is configured', () => {
    expect(
      resolveLanguageModelID({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.6',
        customModelID: ''
      })
    ).toBe('anthropic/claude-sonnet-4.6')
  })

  test('uses a custom OpenRouter model ID when provided', () => {
    expect(
      resolveLanguageModelID({
        providerID: 'openrouter',
        modelID: 'anthropic/claude-sonnet-4.6',
        customModelID: '  meta-llama/llama-3.3-70b-instruct  '
      })
    ).toBe('meta-llama/llama-3.3-70b-instruct')
  })
})

describe('model provider registry', () => {
  test('offers Flash first and M3 as the MiniMax fallback', () => {
    const provider = AI_PROVIDERS.find(({ id }) => id === 'minimax')
    expect(provider?.defaultModel).toBe('MiniMax-M3.1-Flash')
    expect(provider?.models.map(({ id }) => id)).toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M3'])
  })

  test.each(['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7'])(
    'sends %s through the OpenAI-compatible chat endpoint',
    async (modelID) => {
      let requestURL = ''
      let requestBody = ''
      const fetchSpy: FetchFunction = async (input, init) => {
        requestURL = String(input)
        requestBody = String(init?.body)
        throw new Error('stop')
      }
      const config: ModelConfig = {
        providerID: 'minimax',
        apiKey: 'test-key',
        modelID,
        customModelID: '',
        customBaseURL: '',
        customAPIType: 'completions'
      }

      const model = languageModelInstance(
        modelProviderAdapter('minimax').create(config, { fetch: fetchSpy })
      )
      await Promise.resolve(
        model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
      ).catch(() => undefined)

      const body: unknown = JSON.parse(requestBody)
      expect(requestURL).toBe('https://api.minimax.io/v1/chat/completions')
      expect(body).toMatchObject({ model: modelID })
      expect(body).not.toHaveProperty('reasoning_effort')
      expect(body).not.toHaveProperty('thinking')
    }
  )

  test.each(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const)(
    'sends a supported Flash effort for %s',
    async (level) => {
      expect(await thinkingRequestBody('minimax', 'MiniMax-M3.1-Flash', level)).toMatchObject({
        model: 'MiniMax-M3.1-Flash',
        reasoning_effort: level === 'off' || level === 'minimal' ? 'low' : level
      })
    }
  )

  describe.each(['off', 'minimal'] as const)('at %s thinking', (level) => {
    test.each([
      ['zai', 'glm-5.3', { thinking: { type: 'enabled' } }],
      ['zai', 'glm-5.3-flash', { thinking: { type: 'enabled' } }],
      [
        'google',
        'gemini-4-argon',
        { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }
      ],
      [
        'google',
        'gemini-3.1-pro-preview',
        { generationConfig: { thinkingConfig: { thinkingLevel: 'low' } } }
      ],
      ['openai', 'gpt-6.1-sol', { reasoning: { effort: 'low' } }],
      ['openai', 'gpt-6-astra', { reasoning: { effort: 'low' } }]
    ] as const)('%s %s sends the lowest thinking it accepts', async (providerID, modelID, sent) => {
      expect(await thinkingRequestBody(providerID, modelID, level)).toMatchObject(sent)
    })
  })

  test('registers every direct provider without handling agent runtimes as models', () => {
    for (const provider of AI_PROVIDERS.filter((entry) => entry.id !== 'harness:pi')) {
      expect(modelProviderAdapter(provider.id).create).toBeFunction()
    }
    expect(() => modelProviderAdapter('harness:pi')).toThrow('Harness agents')
    expect(() => modelProviderAdapter('acp:claude-code')).toThrow(
      'ACP providers and Harness agents do not use direct API models'
    )
  })
})

describe('anthropic compatible adapter', () => {
  const config: ModelConfig = {
    providerID: 'anthropic',
    apiKey: 'test-key',
    modelID: 'claude-sonnet-4.6',
    customModelID: '',
    customBaseURL: '',
    customAPIType: 'completions'
  }

  async function capturedHeaders(): Promise<Record<string, string>> {
    let captured: Record<string, string> = {}
    const fetchSpy: FetchFunction = async (_input, init) => {
      captured = Object.fromEntries(new Headers(init?.headers).entries())
      throw new Error('stop')
    }

    const model = languageModelInstance(
      createAnthropicCompatibleAdapter().create(config, { fetch: fetchSpy })
    )
    await Promise.resolve(
      model.doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
    ).catch(() => undefined)

    return captured
  }

  test('opts into direct browser access so Anthropic returns CORS headers', async () => {
    // Anthropic omits Access-Control-Allow-Origin unless this header is sent, which makes the
    // web build fail with an opaque network error. See #436.
    expect(await capturedHeaders()).toHaveProperty(
      'anthropic-dangerous-direct-browser-access',
      'true'
    )
  })
})

describe('tool image uploads', () => {
  const anthropic: ModelConfig = {
    providerID: 'anthropic',
    apiKey: 'test-key',
    modelID: 'claude-sonnet-4.6',
    customModelID: '',
    customBaseURL: '',
    customAPIType: 'completions'
  }
  const png = new Uint8Array([137, 80, 78, 71])

  test('Anthropic uploads a tool image to its files API and gets back the file and its expiry', async () => {
    const requests: Request[] = []
    const files: FetchFunction = async (input, init) => {
      requests.push(new Request(input, init))
      return Response.json({
        id: 'file_1',
        type: 'file',
        filename: 'image.png',
        mime_type: 'image/png',
        size_bytes: png.length,
        created_at: '2026-10-27T00:00:00Z',
        expires_at: '2026-11-26T00:00:00Z'
      })
    }
    const uploader = expectDefined(
      createToolImageUploader(anthropic, 'connection', { fetch: files })
    )
    const file = await uploader.upload({ data: fromUint8Array(png), mediaType: 'image/png' })

    expect(file).toEqual({ reference: { anthropic: 'file_1' }, expiresAt: '2026-11-26T00:00:00Z' })
    const request = expectDefined(requests[0])
    expect(request.url).toBe('https://api.anthropic.com/v1/files')
    expect(request.headers.get('anthropic-beta')).toBe('files-api-2025-04-14')
    const form = await request.formData()
    const sent = form.get('file')
    if (!(sent instanceof File)) throw new Error('The upload carries no file')
    expect(sent.name).toBe('image.png')
    expect(new Uint8Array(await sent.arrayBuffer())).toEqual(png)
    // Anthropic keeps a file until it is deleted unless the upload says otherwise.
    expect(form.get('expires_in_seconds')).toBe(String(30 * 24 * 60 * 60))
  })

  test('an Anthropic-compatible endpoint gets no expiry field it may refuse', async () => {
    const forms: FormData[] = []
    const files: FetchFunction = async (input, init) => {
      forms.push(await new Request(input, init).formData())
      return Response.json({
        id: 'file_1',
        type: 'file',
        filename: 'image.png',
        mime_type: 'image/png',
        size_bytes: png.length,
        created_at: '2026-10-27T00:00:00Z'
      })
    }
    const uploader = expectDefined(
      createToolImageUploader(
        {
          ...anthropic,
          providerID: 'anthropic-compatible',
          customBaseURL: 'https://proxy.example/v1'
        },
        'connection',
        { fetch: files }
      )
    )
    await uploader.upload({ data: fromUint8Array(png), mediaType: 'image/png' })
    expect(forms[0]?.has('file')).toBe(true)
    expect(forms[0]?.has('expires_in_seconds')).toBe(false)
  })

  test('Anthropic reads a referenced tool image by its file id', async () => {
    let body = ''
    const fetchSpy: FetchFunction = async (_input, init) => {
      body = String(init?.body)
      throw new Error('stop')
    }
    const model = languageModelInstance(
      createAnthropicCompatibleAdapter().create(anthropic, { fetch: fetchSpy })
    )
    if (model.specificationVersion !== 'v4') throw new Error('Expected an AI SDK v4 model')
    await Promise.resolve(
      model.doGenerate({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Export it' }] },
          {
            role: 'assistant',
            content: [
              { type: 'tool-call', toolCallId: 'call', toolName: 'export_image', input: {} }
            ]
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call',
                toolName: 'export_image',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'file',
                      mediaType: 'image/png',
                      data: { type: 'reference', reference: { anthropic: 'file_1' } }
                    }
                  ]
                }
              }
            ]
          }
        ]
      })
    ).catch(() => undefined)

    const sent: unknown = JSON.parse(body)
    expect(sent).toMatchObject({
      messages: [
        { role: 'user' },
        { role: 'assistant' },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              content: [{ type: 'image', source: { type: 'file', file_id: 'file_1' } }]
            }
          ]
        }
      ]
    })
  })

  test.each(['openai', 'zai'] as const)(
    '%s gets no uploader, having no files API',
    (providerID) => {
      expect(createToolImageUploader({ ...anthropic, providerID }, 'connection')).toBeUndefined()
    }
  )
})
