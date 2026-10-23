import { invoke } from '@tauri-apps/api/core'
import * as v from 'valibot'

import { aiMessages } from '@open-pencil/vue/i18n'

import { openExternalLink } from '@/app/shell/ui'
import { tauriFetch } from '@/app/tauri/http'

import { createPKCE } from '../pkce'
import type { ChatGPTCredential } from './credential'
import { chatGPTAuthorizationURL, exchangeChatGPTCode } from './oauth'

export type ChatGPTSignInFailure = 'cancelled' | 'expired' | 'port-in-use' | 'failed'
export type ChatGPTSignInResult =
  | { ok: true; credential: ChatGPTCredential }
  | { ok: false; reason: ChatGPTSignInFailure }

export interface ChatGPTSignIn {
  /** Opens the ChatGPT sign-in page again for the same attempt. */
  reopen: () => void
  result: Promise<ChatGPTSignInResult>
}

/** What `chatgpt_oauth_wait` returns once the redirect arrives, the wait ends, or it is cancelled. */
const loopbackOutcomeSchema = v.variant('kind', [
  v.object({ kind: v.literal('code'), code: v.string() }),
  v.object({ kind: v.picklist(['denied', 'expired', 'cancelled']) })
])

function failure(reason: ChatGPTSignInFailure): ChatGPTSignInResult {
  return { ok: false, reason }
}

/**
 * Signs in to ChatGPT in the system browser. The desktop shell takes the loopback port the
 * redirect returns to before the page opens; the browser app cannot receive it.
 */
export function signInWithChatGPT(signal: AbortSignal): ChatGPTSignIn {
  let authorizationURL = ''
  const reopen = () => {
    if (authorizationURL) void openExternalLink(authorizationURL)
  }
  const result = (async (): Promise<ChatGPTSignInResult> => {
    const cancel = () => void invoke('chatgpt_oauth_cancel')
    // Read through a call: the signal can abort while the attempt awaits.
    const aborted = () => signal.aborted
    const pkce = await createPKCE()
    try {
      const ai = aiMessages.get()
      // The browser shows these after the redirect, so they come in the app's language.
      const pages = {
        signedIn: ai.aiSetupChatGPTCallbackSignedIn,
        cancelled: ai.aiSetupChatGPTCallbackCancelled,
        stale: ai.aiSetupChatGPTCallbackStale
      }
      await invoke('chatgpt_oauth_listen', { state: pkce.state, pages })
    } catch (error) {
      return failure(error === 'port-in-use' ? 'port-in-use' : 'failed')
    }
    if (signal.aborted) {
      cancel()
      return failure('cancelled')
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      authorizationURL = chatGPTAuthorizationURL(pkce)
      await openExternalLink(authorizationURL)
      const outcome = v.parse(loopbackOutcomeSchema, await invoke('chatgpt_oauth_wait'))
      if (outcome.kind === 'expired') return failure('expired')
      if (outcome.kind !== 'code') return failure('cancelled')
      const credential = await exchangeChatGPTCode(outcome.code, pkce.verifier, tauriFetch)
      return aborted() ? failure('cancelled') : { ok: true, credential }
    } catch {
      // Free the port: a failure before the wait leaves the listener holding it.
      cancel()
      return failure(aborted() ? 'cancelled' : 'failed')
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  })()
  return { reopen, result }
}
