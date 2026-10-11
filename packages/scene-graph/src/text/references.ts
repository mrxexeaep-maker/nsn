import { mapValues } from 'es-toolkit/object'

import type { StyleRun } from '../types'

/** What a text's runs refer to outside the text: the variables they bind and the styles they use. */
export interface StyleRunReferences {
  variables: string[]
  styles: string[]
}

/** The variables and styles a text's runs refer to, which copies and transfers carry with it. */
export function styleRunReferences(runs: readonly StyleRun[]): StyleRunReferences {
  const variables = new Set<string>()
  const styles = new Set<string>()
  for (const { style } of runs) {
    for (const id of Object.values(style.boundVariables ?? {})) if (id) variables.add(id)
    if (style.textStyleId) styles.add(style.textStyleId)
    if (style.fillStyleId) styles.add(style.fillStyleId)
  }
  return { variables: [...variables], styles: [...styles] }
}

/** Runs whose variables and styles are renamed, as a copy into another document renames them. */
export function remapStyleRunReferences(
  runs: readonly StyleRun[],
  rename: { variable: (id: string) => string; style: (id: string) => string }
): StyleRun[] {
  return runs.map((run) => {
    const { boundVariables, textStyleId, fillStyleId } = run.style
    if (!boundVariables && !textStyleId && !fillStyleId) return run
    const style = { ...run.style }
    if (boundVariables) {
      style.boundVariables = mapValues(boundVariables, (id) => (id ? rename.variable(id) : id))
    }
    if (textStyleId) style.textStyleId = rename.style(textStyleId)
    if (fillStyleId) style.fillStyleId = rename.style(fillStyleId)
    return { ...run, style }
  })
}
