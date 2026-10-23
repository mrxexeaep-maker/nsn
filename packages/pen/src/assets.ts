import type { PenDocument, PenNode, PenOverride, PenPaint, PenPaints } from './schema'

/**
 * Iconify names for a pen.dev icon, the best first. Material Symbols draws unfilled by default,
 * which Iconify names `-outline`; an icon with no unfilled form has only the filled one.
 */
export function iconNames(library: string, icon: string): string[] {
  if (library === 'lucide' || library === 'feather') return [`${library}:${icon}`]
  if (library === 'phosphor') return [`ph:${icon}`]
  const style = /^Material Symbols (Outlined|Rounded|Sharp)$/.exec(library)?.[1]
  if (!style) return []
  const suffix = style === 'Outlined' ? '' : `-${style.toLowerCase()}`
  return [`material-symbols:${icon}-outline${suffix}`, `material-symbols:${icon}${suffix}`]
}

/**
 * Whether an image URL names a file in the document's folder: no scheme, no absolute path, and no
 * `..` step out of it. Data URLs are read from the document itself.
 */
export function isDocumentAssetPath(url: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('\\')) return false
  return !url.split(/[/\\]/).includes('..')
}

/** The icons and image files a document draws, so a host can load them before reading it. */
export interface PenAssets {
  /** Iconify names of every icon, with each icon's fallbacks. */
  icons: string[]
  /** Image files, relative to the document. */
  images: string[]
}

function paintList(paints: PenPaints | undefined): PenPaint[] {
  if (paints === undefined) return []
  return Array.isArray(paints) ? paints : [paints]
}

function paintImages(paints: PenPaints | undefined, images: Set<string>) {
  for (const paint of paintList(paints)) {
    if (typeof paint === 'object' && paint.type === 'image' && typeof paint.url === 'string') {
      if (isDocumentAssetPath(paint.url)) images.add(paint.url)
    }
  }
}

interface Found {
  icons: Set<string>
  images: Set<string>
  libraries: Set<string>
  /** Icons an override names without its library, which comes from the layer it overrides. */
  bareIcons: Set<string>
}

function collect(node: PenOverride, assets: Found) {
  if (node.icon && (node.type === 'icon' || node.type === undefined)) {
    if (node.library) {
      assets.libraries.add(node.library)
      for (const name of iconNames(node.library, node.icon)) assets.icons.add(name)
    } else {
      assets.bareIcons.add(node.icon)
    }
  }
  paintImages(node.fill, assets.images)
  if (!(typeof node.stroke === 'object' && 'thickness' in node.stroke)) {
    paintImages(node.stroke, assets.images)
  }
  for (const child of node.children ?? []) collect(child, assets)
  for (const override of Object.values(node.descendants ?? {})) collect(override, assets)
}

export function penAssets(doc: PenDocument): PenAssets {
  const assets: Found = {
    icons: new Set(),
    images: new Set(),
    libraries: new Set(),
    bareIcons: new Set()
  }
  for (const node of doc.children) collect(node satisfies PenNode, assets)
  for (const icon of assets.bareIcons) {
    for (const library of assets.libraries) {
      for (const name of iconNames(library, icon)) assets.icons.add(name)
    }
  }
  return { icons: [...assets.icons], images: [...assets.images] }
}
