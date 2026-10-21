import type { AIProviderID, ModelOption } from '@open-pencil/core/constants'

/** Filter discovery only; saved and custom model IDs still resolve independently. */
export function currentMiniMaxModels(
  providerID: AIProviderID,
  models: ModelOption[]
): ModelOption[] {
  if (providerID !== 'minimax' && providerID !== 'openrouter') return models
  const ids =
    providerID === 'minimax'
      ? ['MiniMax-M3.1-Flash', 'MiniMax-M3']
      : ['minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3']
  const current = ids.flatMap((id) => {
    const model = models.find((entry) => entry.id === id)
    return model ? [model] : []
  })
  if (providerID === 'minimax') return current
  return [...models.filter((model) => !/^minimax\/minimax-m/i.test(model.id)), ...current]
}
