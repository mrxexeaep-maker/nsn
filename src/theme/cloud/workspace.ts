import { tv } from 'tailwind-variants'

/** Creating a Cloud workspace and managing who belongs to it. */
export const cloudWorkspace = tv({
  slots: {
    form: 'flex flex-col gap-1.5',
    label: 'text-[11px] font-medium text-muted',
    stack: 'flex flex-col gap-4',
    inline: 'flex items-center gap-2',
    section: 'flex flex-col gap-2',
    sectionTitle: 'text-[11px] font-medium text-muted',
    sent: 'flex flex-col gap-1.5',
    note: 'text-[11px] text-muted',
    list: 'flex flex-col divide-y divide-border rounded border border-border',
    row: 'flex items-center gap-3 px-3 py-2',
    person: 'flex min-w-0 flex-1 flex-col',
    personName: 'truncate text-xs text-surface',
    personEmail: 'truncate text-[11px] text-muted',
    you: 'ml-1 text-[11px] text-muted',
    role: 'shrink-0 text-[11px] text-muted',
    roleSelect: 'w-24 shrink-0',
    removeSpace: 'size-6 shrink-0',
    pendingIcon:
      'flex size-6 shrink-0 items-center justify-center rounded-full bg-panel-field text-muted'
  }
})
