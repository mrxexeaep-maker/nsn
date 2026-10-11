import { PingSchema, UsageEventSchema, type UsageEvent } from './schema'

export interface FieldDescription {
  name: string
  description: string
  /** Every value the field can take, or empty when it is free-form within its pattern. */
  values: readonly string[]
}

export interface UsageEventDescription {
  name: string
  description: string
  properties: FieldDescription[]
}

type EventProperties<E> = Exclude<keyof E, 'name' | 'timestamp'>

/** Plain-language meaning of each event and property; the privacy page renders these. */
const EVENT_DESCRIPTIONS: {
  [E in UsageEvent as E['name']]: {
    description: string
    properties: Record<EventProperties<E>, string>
  }
} = {
  app_opened: {
    description: 'OpenPencil started.',
    properties: { locale: 'The interface language.' }
  },
  document_opened: {
    description: 'A file was opened.',
    properties: { format: 'The file format.' }
  },
  document_exported: {
    description: 'A file was exported.',
    properties: { format: 'The export format.' }
  },
  ai_reply_finished: {
    description: 'The AI assistant finished a reply.',
    properties: { provider: 'Which kind of AI provider or agent answered.' }
  }
}

type BuildField = keyof typeof PingSchema.entries

const BUILD_FIELDS = [
  'version',
  'platform',
  'arch',
  'app',
  'browser'
] as const satisfies readonly BuildField[]

const BUILD_DESCRIPTIONS: Record<BuildField, string> = {
  version: 'The OpenPencil version, such as 0.16.0.',
  platform: 'The operating system family.',
  arch: 'The processor architecture, known on desktop only.',
  app: 'The desktop app or the web app.',
  browser: 'The browser family, for the web app.'
}

function valuesOf(schema: unknown): readonly string[] {
  if (typeof schema !== 'object' || schema === null || !('options' in schema)) return []
  const { options } = schema
  return Array.isArray(options) ? options.filter((value) => typeof value === 'string') : []
}

/** The fields every ping and every usage batch carries. */
export function describeBuildFields(): FieldDescription[] {
  return BUILD_FIELDS.map((name) => ({
    name,
    description: BUILD_DESCRIPTIONS[name],
    values: valuesOf(PingSchema.entries[name])
  }))
}

/** Every usage event, its properties, and the values each property can take. */
export function describeUsageEvents(): UsageEventDescription[] {
  return UsageEventSchema.options.map((option) => {
    const name = option.entries.name.literal
    const described: { description: string; properties: Record<string, string> } =
      EVENT_DESCRIPTIONS[name]
    return {
      name,
      description: described.description,
      properties: Object.entries(option.entries)
        .filter(([key]) => key !== 'name' && key !== 'timestamp')
        .map(([key, schema]) => ({
          name: key,
          description: described.properties[key] ?? '',
          values: valuesOf(schema)
        }))
    }
  })
}
