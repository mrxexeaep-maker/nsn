import { uploadFile, type LanguageModel } from 'ai'
import * as v from 'valibot'

import type { ToolImageUploader } from '@open-pencil/core/tools'

import { modelProviderAdapter } from '@/app/ai/providers/registry'
import type { ModelConfig, ModelProviderRuntime } from '@/app/ai/providers/types'
import type { FetchFunction } from '@/app/http/types'
import { isTauri } from '@/app/tauri/env'
import { tauriFetch } from '@/app/tauri/http'

export type { ModelConfig } from '@/app/ai/providers/types'

export function resolveLanguageModelID(
  config: Pick<ModelConfig, 'providerID' | 'modelID' | 'customModelID'>
): string {
  if (
    config.providerID === 'openrouter' ||
    config.providerID === 'openai-compatible' ||
    config.providerID === 'anthropic-compatible'
  ) {
    return config.customModelID.trim() || config.modelID
  }
  return config.modelID
}

function desktopFetch(): FetchFunction | undefined {
  return isTauri() ? tauriFetch : undefined
}

/**
 * `runtime.credentials` is the connection's store, for providers whose sign-in refreshes; a
 * `runtime.fetch`, such as Cloud's AI service's, replaces the desktop fetch.
 */
export function createLanguageModel(
  config: ModelConfig,
  runtime: ModelProviderRuntime = {}
): LanguageModel {
  return modelProviderAdapter(config.providerID).create(config, {
    ...runtime,
    fetch: runtime.fetch ?? desktopFetch()
  })
}

const uploadedFileSchema = v.object({ expires_at: v.nullish(v.string()) })

/** Anthropic keeps an upload until it is deleted unless asked otherwise. */
const ANTHROPIC_FILE_SECONDS = 30 * 24 * 60 * 60

export function createToolImageUploader(
  config: ModelConfig,
  connectionId: string,
  runtime: ModelProviderRuntime = {}
): ToolImageUploader | undefined {
  const filesAPI = modelProviderAdapter(config.providerID).files
  if (!filesAPI) return undefined
  const send = runtime.fetch ?? desktopFetch() ?? globalThis.fetch
  return {
    // A file lives at the endpoint that stored it, and a connection's base URL can change.
    scope: JSON.stringify([connectionId, config.customBaseURL ?? null]),
    async upload({ data, mediaType }, { abortSignal } = {}) {
      // The AI SDK keeps only the file id of the answer, so its expiry is read here.
      let expiresAt: string | undefined
      const files = filesAPI(config, {
        ...runtime,
        async fetch(input, init) {
          if (config.providerID === 'anthropic' && init?.body instanceof FormData) {
            init.body.append('expires_in_seconds', String(ANTHROPIC_FILE_SECONDS))
          }
          const response = await send(input, init)
          const answer = v.safeParse(
            v.pipe(v.string(), v.parseJson(), uploadedFileSchema),
            await response.clone().text()
          )
          if (answer.success) expiresAt = answer.output.expires_at ?? undefined
          return response
        }
      })
      const filename = mediaType.replace('/', '.')
      const { providerReference } = await uploadFile({
        api: files,
        data,
        mediaType,
        filename,
        abortSignal
      })
      return { reference: providerReference, expiresAt }
    }
  }
}
