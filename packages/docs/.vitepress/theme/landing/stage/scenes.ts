// The app's tour, prebuilt from `tools/generate/demo`; the docs config ensures it exists.
import demoFigURL from '#app-public/demo.fig?url'
import dedent from 'dedent'

import { renderJSX } from '@open-pencil/core/design-jsx'
import { computeAllLayouts } from '@open-pencil/core/layout'
import { CHAPTERS, sectionName, type TourChapter } from '@open-pencil/demo-tools/chapters'
import type { SceneNode } from '@open-pencil/scene-graph'

import { followAppTheme } from '@/app/demo/theme'
import type { EditorStore } from '@/app/editor/active-store'
import { loadFont } from '@/app/editor/fonts'
import { resolvedAppTheme } from '@/app/shell/theme'

const GUARANTEES = [
  { title: 'Opens .fig', detail: 'Bring your Figma files with you.' },
  { title: 'MIT licensed', detail: 'Read, fork, and ship all of it.' },
  { title: 'Your AI keys', detail: 'Any provider. Nothing goes through us.' }
]

export const GUARANTEES_JSX = [
  '<Frame name="Guarantees" w="fill" h="hug" flex="row" gap={12}>',
  ...GUARANTEES.flatMap(({ title, detail }) => [
    '  <Frame name="Guarantee" grow={1} h="hug" flex="col" gap={4} p={16} bg="#F4F5FA" rounded={12}>',
    `    <Text name="Title" size={14} weight={600} color="#11131F">${title}</Text>`,
    `    <Text name="Detail" w="fill" size={13} lineHeight={19} color="#5B6072">${detail}</Text>`,
    '  </Frame>'
  ]),
  '</Frame>'
].join('\n')

function pricingJSX(): string {
  return dedent`
    <Frame name="Pricing" w={720} h="hug" flex="col" gap={28} p={40} bg="#FFFFFF" rounded={24}>
      <Frame name="Header" w="fill" h="hug" flex="col" gap={10}>
        <Text name="Eyebrow" size={12} weight={600} color="#3B5BDB" letterSpacing={1} textCase="upper">Plans</Text>
        <Text name="Title" w="fill" size={34} weight="bold" color="#11131F">Own your design stack</Text>
        <Text name="Subtitle" w="fill" size={16} lineHeight={24} color="#5B6072">Open files, open formats, and storage you control.</Text>
      </Frame>
      <Frame name="Plans" w="fill" h="hug" flex="row" gap={20}>
        <Frame name="Plan / Local" grow={1} h="hug" flex="col" gap={18} p={24} bg="#F4F5FA" rounded={16}>
          <Text name="Plan name" size={14} weight={600} color="#5B6072">Local</Text>
          <Frame name="Price" w="fill" h="hug" flex="col" gap={2}>
            <Text name="Amount" size={40} weight="bold" color="#11131F">$0</Text>
            <Text name="Period" size={14} color="#5B6072">forever</Text>
          </Frame>
          <Text name="Summary" w="fill" size={14} lineHeight={21} color="#5B6072">The full editor on your machine. No account.</Text>
          <Frame name="Button" w="fill" h={44} flex="row" justify="center" items="center" bg="#11131F" rounded={10}>
            <Text name="Label" size={14} weight={600} color="#FFFFFF">Download</Text>
          </Frame>
        </Frame>
        <Frame name="Plan / Self-hosted" grow={1} h="hug" flex="col" gap={18} p={24} bg="#11131F" rounded={16}>
          <Text name="Plan name" size={14} weight={600} color="#A5B4FC">Self-hosted</Text>
          <Frame name="Price" w="fill" h="hug" flex="col" gap={2}>
            <Text name="Amount" size={40} weight="bold" color="#FFFFFF">Yours</Text>
            <Text name="Period" size={14} color="#9AA0B4">on your servers</Text>
          </Frame>
          <Text name="Summary" w="fill" size={14} lineHeight={21} color="#9AA0B4">Your storage, your identity provider, your rules.</Text>
          <Frame name="Button" w="fill" h={44} flex="row" justify="center" items="center" bg="#3B5BDB" rounded={10}>
            <Text name="Label" size={14} weight={600} color="#FFFFFF">Coming soon</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  `
}

async function finish(store: EditorStore): Promise<void> {
  const pageId = store.state.currentPageId
  await store.loadFontsForNodes(store.graph.getChildren(pageId).map((node) => node.id))
  computeAllLayouts(store.graph, pageId)
  store.clearSelection()
  store.zoomToFit()
  store.requestRender()
}

const INTER_STYLES = ['Regular', 'Medium', 'SemiBold', 'Bold']

/** Text is measured as it is laid out, so the faces it uses load first. */
async function loadInter(): Promise<void> {
  await Promise.all(INTER_STYLES.map((style) => loadFont('Inter', style)))
}

/** One download of the tour for every stage that shows a chapter of it. */
let tourBytes: Promise<ArrayBuffer> | null = null

function fetchTour(): Promise<ArrayBuffer> {
  tourBytes ??= fetch(demoFigURL).then((response) => {
    if (!response.ok) throw new Error(`The tour is unavailable (${response.status})`)
    return response.arrayBuffer()
  })
  // A failed download is tried again by the next stage rather than shared.
  tourBytes.catch(() => {
    tourBytes = null
  })
  return tourBytes
}

/** Opens the tour like any `.fig` file, in the theme the docs site shows, as `/demo` does. */
async function openTour(store: EditorStore): Promise<void> {
  // A File copies the bytes, so every stage decodes its own.
  await store.openFigFile(new File([await fetchTour()], 'Demo.fig'))
  followAppTheme(store, resolvedAppTheme)
}

function chapterSection(store: EditorStore, chapter: TourChapter): SceneNode {
  const name = sectionName(chapter)
  const section = store.graph
    .getChildren(store.state.currentPageId)
    .find((node) => node.name === name)
  if (!section) throw new Error(`The tour has no "${name}" chapter`)
  return section
}

/** The layer a chapter is about, by the name the tour gives it. */
function chapterSubject(store: EditorStore, chapter: TourChapter): SceneNode {
  const section = chapterSection(store, chapter)
  const subject = store.graph.getChildren(section.id).find((node) => node.name === chapter.subject)
  if (!subject) throw new Error(`"${section.name}" has no "${chapter.subject}"`)
  return subject
}

/** Room around a framed layer, and above it for the preview's workspace pill. */
const FRAME_MARGIN = 24
const PREVIEW_PILL_INSET = 56
/** Small subjects are enlarged to fill the canvas, up to this zoom. */
const MAX_FRAME_ZOOM = 2

/**
 * Fill the canvas with `node`, past the 100% that fitting stops at, so the rest of the tour,
 * its prose and its tip cards, stays out of view; the landing says those things itself.
 */
function frameNode(store: EditorStore, node: SceneNode, preview = false): void {
  const { x, y } = store.graph.getAbsolutePosition(node.id)
  const { width, height } = store.getViewportSize()
  const inset = preview ? PREVIEW_PILL_INSET : 0
  const zoom = Math.min(
    (width - FRAME_MARGIN * 2) / node.width,
    (height - FRAME_MARGIN * 2 - inset) / node.height,
    MAX_FRAME_ZOOM
  )
  store.centerOn(x + node.width / 2, y + node.height / 2 - inset / 2 / zoom, zoom)
}

/**
 * Leave the stage only what it shows. The chapter's heading and tip card beside `subject` are
 * hidden: the landing says those things in its own words and language. Other stages drop the
 * Lint chapter, whose planted error would otherwise put a marker at their canvas edge; it holds
 * no component the rest of the tour uses. Like the tour's theme, neither is an edit, so the
 * stage opens with nothing to undo or save.
 */
function isolateChapter(store: EditorStore, tourChapter: TourChapter, subject: SceneNode): void {
  const { graph } = store
  const around = subject.parentId
    ? graph.getChildren(subject.parentId).filter((node) => node.id !== subject.id)
    : []
  const lint = tourChapter === CHAPTERS.lint ? null : chapterSection(store, CHAPTERS.lint)
  graph.applyImportedStateDuring(() => {
    for (const node of around) graph.updateNode(node.id, { visible: false })
    if (lint) graph.deleteNode(lint.id)
  })
}

/** Opens the tour on one chapter's subject, with nothing else in view. */
async function chapter(
  store: EditorStore,
  tourChapter: TourChapter,
  options: { preview?: boolean; select?: (subject: SceneNode) => string | undefined } = {}
): Promise<void> {
  await openTour(store)
  const subject = chapterSubject(store, tourChapter)
  isolateChapter(store, tourChapter, subject)
  frameNode(store, subject, options.preview)
  const selected = options.select?.(subject)
  if (selected) store.select([selected])
  if (options.preview) store.startPlay()
}

/** The first layer under `node` with `name`, searching breadth first. */
function descendant(store: EditorStore, node: SceneNode, name: string): string | undefined {
  const pending = [...node.childIds]
  while (pending.length > 0) {
    const id = pending.shift()
    const current = id ? store.graph.getNode(id) : undefined
    if (!current) continue
    if (current.name === name) return current.id
    pending.push(...current.childIds)
  }
  return undefined
}

export function findByName(store: EditorStore, name: string): string | null {
  const pending = store.graph.getChildren(store.state.currentPageId).map((node) => node.id)
  while (pending.length > 0) {
    const id = pending.shift()
    const node = id ? store.graph.getNode(id) : undefined
    if (!node) continue
    if (node.name === name) return node.id
    pending.push(...node.childIds)
  }
  return null
}

/**
 * Opens the layer tree down to `depth`, where 0 is the page's top-level layers. The tree opens
 * the ancestors of whatever is selected and keeps them open, so selecting the layers at that
 * depth and then nothing leaves them showing, with no selection on the canvas.
 */
function revealLayers(store: EditorStore, depth: number): void {
  let level = store.graph.getChildren(store.state.currentPageId).map((node) => node.id)
  for (let current = 0; current < depth; current++) {
    level = level.flatMap((id) => store.graph.getNode(id)?.childIds ?? [])
  }
  store.select(level)
  store.clearSelection()
}

/** The whole tour in the layer tree, its chapters open, and the first one on the canvas. */
async function figma(store: EditorStore): Promise<void> {
  await openTour(store)
  frameNode(store, chapterSection(store, CHAPTERS.hello))
  revealLayers(store, 1)
}

async function pricing(store: EditorStore): Promise<void> {
  await loadInter()
  await renderJSX(store.graph, pricingJSX(), {
    parentId: store.state.currentPageId,
    x: 0,
    y: 0
  })
  await finish(store)
}

/** A plan card selected, so the block's panel has something to show from the start. */
async function pricingWithSelection(store: EditorStore): Promise<void> {
  await pricing(store)
  const plan = findByName(store, 'Plan / Local')
  if (plan) store.select([plan])
}

export type SceneBuilder = (store: EditorStore) => Promise<void>

export const SCENES = {
  figma,
  // The middle player brings its own cover through the artwork slot, which the panel shows.
  slots: (store) => chapter(store, CHAPTERS.slots, { select: (players) => players.childIds[1] }),
  // The hero in preview: its background moves and the player is a working control.
  hero: (store) =>
    chapter(store, CHAPTERS.hello, {
      preview: true,
      select: (s) => descendant(store, s, 'Player')
    }),
  modes: (store) => chapter(store, CHAPTERS.modes),
  shaders: (store) =>
    chapter(store, CHAPTERS.shaders, {
      preview: true,
      select: (s) => descendant(store, s, 'Shader')
    }),
  // The sign-in card selected, so the Lint tab lists its planted problems alone.
  lint: (store) => chapter(store, CHAPTERS.lint, { select: (card) => card.id }),
  code: (store) => chapter(store, CHAPTERS.code, { select: (s) => s.id }),
  pricing: (store) => pricing(store),
  pricingSelected: pricingWithSelection
} satisfies Record<string, SceneBuilder>
