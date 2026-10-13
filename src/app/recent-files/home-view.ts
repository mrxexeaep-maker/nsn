import { useLocalStorage } from '@vueuse/core'

/** The start page's lists, as Figma's Recents tabs: files opened lately, and storage. */
export type HomeSection = 'recent' | 'storage'

/** The file types the start page's All files filter offers. */
export type HomeFileType = 'figma' | 'pencil' | 'other'
export type HomeFileFilter = 'all' | HomeFileType

/** The list the start page shows; Open Storage Workspace… switches it to storage. */
export const homeSection = useLocalStorage<HomeSection>('open-pencil:home-section', 'recent')
export const homeFileFilter = useLocalStorage<HomeFileFilter>('open-pencil:home-file-filter', 'all')

const FILE_TYPES: Partial<Record<string, HomeFileType>> = { fig: 'figma', pen: 'pencil' }

/** A file's type from its name or path; storage documents are always `.fig` files. */
export function homeFileType(nameOrPath: string): HomeFileType {
  const extension = nameOrPath.split('.').pop()?.toLowerCase() ?? ''
  return FILE_TYPES[extension] ?? 'other'
}

export function matchesHomeFileFilter(type: HomeFileType, filter: HomeFileFilter): boolean {
  return filter === 'all' || type === filter
}
