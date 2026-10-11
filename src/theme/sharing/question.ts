export default {
  slots: {
    root: 'flex flex-col gap-2',
    heading: 'text-sm font-semibold text-surface',
    text: 'text-xs leading-relaxed text-muted',
    actions: 'flex flex-wrap items-center justify-end gap-2 pt-1',
    answer: 'text-xs leading-relaxed text-surface'
  },
  variants: {
    framed: {
      // On the welcome screen, a card of its own below the AI introduction.
      true: { root: 'rounded-lg border border-border p-4' }
    }
  }
}
