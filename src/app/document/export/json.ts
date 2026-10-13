import { getExportBytes, saveExportedFile } from '@/app/document/export/files'
import { downloadBlob } from '@/app/document/io/browser'

/**
 * Saves JSON text where the person chooses: the save dialog on desktop and in browsers with a
 * save picker, a download otherwise. `false` means the person cancelled.
 */
export function saveJSONFile(text: string, fileName: string): Promise<boolean> {
  return saveExportedFile(
    getExportBytes(text),
    fileName,
    'JSON',
    '.json',
    'application/json',
    downloadBlob
  )
}

/** `name-2026-10-13.json`, from a title that may hold anything a person typed. */
export function datedJSONFileName(name: string, date = new Date()): string {
  const slug = name
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  const day = date.toISOString().slice(0, 10)
  return `${slug || 'openpencil'}-${day}.json`
}
