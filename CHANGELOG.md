# Changelog

## Unreleased

## 0.16.0-beta.1 — 2026-10-11

This is a pre-release: npm packages are published under the `next` tag, and installed apps on the stable release do not update to it. Linux package managers see `0.16.0-beta.1` as newer than `0.16.0`, so `.deb` and `.rpm` users should remove the beta before installing the final 0.16.0.

### Breaking changes

- `useTypography().weights` and the `weights` slot prop of `TypographyControlsRoot` in `@open-pencil/vue` are a computed list of the weights the selected layers' families have, instead of a fixed list of all nine, so read them with `.value`.
- In scripts, a text node's `fontSize`, `fontName`, `fontWeight`, `fills`, `letterSpacing`, `lineHeight`, and `textDecoration` read `figma.mixed` while its characters differ, as in Figma, instead of the text's first value, and setting one restyles every character instead of only characters without a style of their own. `fills` is typed `readonly Fill[] | symbol`, so scripts that index it narrow it first.
- `SceneNode` from `@open-pencil/scene-graph` has `textParagraphs`, `listSpacing`, `paragraphSpacing`, `paragraphIndent`, and `hangingList`, so code that builds `SceneNode` objects itself must include them. `SkiaRenderer.buildParagraph` returns a `TextLayout`, which answers the `Paragraph` queries the renderer and text editor use for the whole text and draws with `draw(canvas, x, y)`, instead of a CanvasKit `Paragraph`.
- `AUTO_LAYOUT_BREAK_THRESHOLD` is removed from `@open-pencil/core/constants`: a layer dragged out of auto layout now leaves by how far its own edge is past the frame, not by a cursor margin.
- `SceneNode` from `@open-pencil/scene-graph` has `targetAspectRatio`, the size whose proportions a locked layer keeps, so code that builds `SceneNode` objects itself must include it.
- `useFlatReorderDrag` from `@open-pencil/vue` takes `operations`, which drops each target accepts, and `onCombine`, for dropping onto an item, and `FlatReorderInstruction` is now any list-item `Instruction`, so it can be `'combine'` when a list opts in; code that switches on its `operation` needs that case.
- The editor `Tool` type from `@open-pencil/core` and `@open-pencil/vue` includes `'COMMENT'`, and `EDITOR_TOOLS` and `TOOL_SHORTCUTS` list the Comment tool on <kbd>C</kbd>, so a `Record<Tool, …>` needs a `COMMENT` entry and toolbars built on `ToolbarRoot` show it. The canvas places nothing while it is active; the app's comments layer does.
- A paint's `gradientTransform` follows Figma's convention everywhere: it maps the layer's unit square onto gradient space, where a linear gradient runs from (0, 0.5) to (1, 0.5). Gradients made in OpenPencil before this release, which used the inverse, draw differently; code that builds gradients by hand should use `linearGradientTransform` and `ellipticalGradientTransform` from the new `@open-pencil/scene-graph/gradient`, which also has Figma's default transform and stops. `isGradientFill` and `GradientFillType` moved there from `@open-pencil/core/geometry`, and `linearGradientEndpoints` is removed from the canvas module.
- `useStrokeControls` from `@open-pencil/vue` acts on the whole selection: `updateAlign`, `selectSide`, and `updateBorderWeight` no longer take a node, and `currentAlign()` and `borderWeight(side)` read the selection and return `MIXED` when it differs. `useEffectsControls().scrubEffect` and `commitEffect` no longer take a node. `useTypography` edits every selected text layer and adds `nodes`, `merged`, and `fontFeature`. The `panels.layersCount` message is now `panels.selectedCount`.
- The app renders `render` JSX itself and no longer accepts the pre-rendered tree that earlier versions of `openpencil-mcp` send, so an older `openpencil-mcp` fails to render into this app version; update it with the app.
- `VectorizedPath` from `@open-pencil/core/vector` replaces `clipNetworks` with `clips`, each the clip path's `id` and one network per clip shape, and adds `elements`, the groups and shape a path was drawn from. `SVGVectorizeResult` adds `texts`, the SVG's text placed in the target space, and `SVGImportData` from `@open-pencil/core/io` adds the root `name` and whether the SVG is `sized`.
- `@open-pencil/scene-graph/layout-guides` is now `@open-pencil/scene-graph/layout`, which also exports the per-axis sizing helpers and the auto layout keyword parsers; `layoutGuideLines` and `layoutGuideSections` are unchanged.
- `SceneNode` from `@open-pencil/scene-graph` has `isExposedInstance`, whether an instance inside a component shows its properties on instances of that component, so code that builds `SceneNode` objects itself must include it. In the plugin API, `isExposedInstance` and `exposedInstances` follow that flag and Figma's rules instead of treating an instance whose swap is bound to a property as exposed: only an instance in a component's own layers whose component has properties can be exposed, and its copies in instances report it but cannot change it.
- `usePosition` from `@open-pencil/vue` reports and edits `x`, `y`, and `rotation` as Figma's properties panel does: the turned layer's box on the canvas, measured from its frame or page, and its counterclockwise angle. `getDefaultCanvasBgColor` and `CANVAS_BG_COLOR_DARK` are removed from `@open-pencil/core/constants`; new pages use `PAGE_DEFAULT_BACKGROUNDS`, keyed by interface theme.
- `SkiaRenderer.hitTestFrameTitle` no longer takes the selected IDs: it finds the name of any frame on the page or in a section under a point, selected or not.
- `SceneNode` from `@open-pencil/scene-graph` has `strokeWeight` and `strokeAlign`, the stroke weight and alignment a layer keeps without strokes, so code that builds `SceneNode` objects itself must include them. `SECTION_DEFAULT_FILL` from `@open-pencil/core/constants` is replaced by `SECTION_DEFAULT_FILLS`, keyed by interface theme.
- `SceneNode.booleanOperation` is a required key whose value may be `undefined`, like every other scene node field, so code that builds `SceneNode` objects itself must include it.
- `useVariables().collections` from `@open-pencil/vue` returns copies of the document's collections instead of the graph's own objects, so components see modes added or renamed in place; change collections through the editor's actions rather than by mutating the returned objects. `addVariable` returns the new variable's ID.
- `useVariablesEditor`, `useVariablesTable`, and `useVariablesDialogState` are removed from `@open-pencil/vue`, together with the `formatModeValue`, `parseVariableValue`, and `shortName` helpers `useVariables()` returned for them, and the package no longer depends on `@tanstack/vue-table`. Build variable editors on `useVariables()` and the editor's variable actions.
- The editor's shared state has a required `canvasVersion`, which the canvas redraws on; `sceneVersion` still counts every document change. Code that creates editor state itself must set it, and code that bumped `sceneVersion` to redraw the canvas calls `requestRender()` instead; `requestRefresh()` records a change the canvas does not draw.
- `sceneNodeToDesignDocument` from `@open-pencil/dom-css` takes an options object, `{ includeSourceIds, tokens }`, instead of a boolean third argument; `tokens: false` writes literal values instead of variable references.
- `randomHex`, `randomInt`, and `randomIndex` moved from `@open-pencil/core/random` and the `@open-pencil/core` barrel to `@open-pencil/scene-graph/random`.
- `Stroke` from `@open-pencil/scene-graph` extends `Fill`, so every stroke states a paint `type` that code constructing one must set to `'SOLID'`, and `copyStroke` deep-copies the paint fields a fill already copied.
- The `design_to_tokens` AI and MCP tool writes a stylesheet of CSS custom properties built from the document's variables. Its `tailwind` format is a Tailwind v4 `@theme` instead of a JavaScript object, and the `json` format is removed. Names come from the variable's code syntax or from Tailwind namespaces (`--color-gray-50`) instead of the collection name, aliases stay `var()` references instead of resolving through the first mode, and non-default modes go under their condition (`[data-theme="dark"]` by default) instead of a class named after the mode. The result lists the tokens it left out under `issues`.
- The editor state's `remoteCursors` is now `presenceCursors`, typed `PresenceCursor[]` from `@open-pencil/core/canvas`, and each cursor has a `kind` of `'person'` or `'agent'`.
- `VariableBinding` and the `colorVariableBinding` paint field are gone from `@open-pencil/core`, `@open-pencil/core/kiwi`, and the Kiwi `Paint` type. `fig.kiwi` never defined the field, so only `.fig` files OpenPencil itself wrote before `colorVar` contain one; reopening such a file leaves the paint's colour unbound, and binding it again records it the way Figma does.
- `encodeNodeChangeWithVariables`, `encodePaintWithVariableBinding`, and `encodeVarint` are removed from `@open-pencil/core` and `@open-pencil/core/kiwi`. They spliced a colour-variable binding into encoded bytes because the field had no schema entry; exports now write `colorVar`, which `fig.kiwi` defines, so nothing needs them. `parseVariableId` is unchanged.
- The desktop app now requires macOS 13 or later; the web app supports Chrome 111, Edge 111, Firefox 128, and Safari 16.4 or later.
- `.fig` reading moved to one reader, so the previous importer's exports are gone. `importNodeChanges` (`@open-pencil/core` and `@open-pencil/core/kiwi`) and `importClipboardNodes` (`@open-pencil/fig/clipboard`) are replaced by `parseFigFile` and `parseFigmaClipboard`; `populateLazyFigImportRoots` and `populateAllLazyFigImportRoots` (`@open-pencil/core/kiwi`) are replaced by `populateFigPage` and `populateAllFigPages` on `@open-pencil/core/io/formats/fig`; `populateAndApplyOverrides` (`@open-pencil/fig/instance-overrides`) is replaced by `interpretInstance` with `materializeInstance`. `FIG_PACKAGE_STATUS` now reads `document-reader`, and `assertFigPackageReady()` is gone, because `@open-pencil/fig` reads an archive into a SceneGraph itself rather than directing callers to Core.
- `sceneNodeToJSX` and `selectionToJSX` in `@open-pencil/core` produce only OpenPencil JSX, and `JSXFormat` and `JSXExportOptions` are removed. For Tailwind JSX, use `sceneNodesToTailwindJSX(graph, nodeIds)` from `@open-pencil/dom-css` or the browser-safe `@open-pencil/dom-css/export`.
- Color conversion and management and text/layout direction helpers moved from `@open-pencil/core/color` and `@open-pencil/core/text` to `@open-pencil/scene-graph/color` and `@open-pencil/scene-graph/text-direction`, and `@open-pencil/core/bytes` is removed in favor of `js-base64`; the `@open-pencil/core` root exports are unchanged. `@open-pencil/dom-css` no longer requires `@open-pencil/core`, and `exportHTMLBundle` takes a font resolver in `fonts` instead of `'assets'`; pass one built on `exportWebFontFaceAssets` from `@open-pencil/core/text/web-font/assets` to keep font files in standalone exports.
- Design JSX moved from `@open-pencil/core` to the new `@open-pencil/design-jsx` package, which depends only on `@open-pencil/scene-graph`. Import elements, paint and effect helpers, variables, `JSX_REFERENCE`, `buildComponent`, `sceneNodeToJSX`, and `selectionToJSX` from `@open-pencil/design-jsx`; `@open-pencil/core/design-jsx` now exports only `renderJSX` and `renderTree`, which render with OpenPencil's icons and layout. The `@open-pencil/core` root keeps `renderJSX` and `renderTree` and drops the other design JSX exports, `renderTreeNode` is removed in favor of `renderTree`, and the `@open-pencil/core/io/formats/jsx` subpath is removed.
- `diff_create` and `diff_show` patches list changed JSX attributes per node, such as `-rounded={8}` and `+rounded={12}`, instead of `key: value` property lines, so they cover every property the JSX export writes and report reordered children as moves. `diff_show` takes JSX attributes in `attributes`, such as `w={200} bg="#FF0000"`, instead of a JSON `props` object, and patches in the old format no longer apply.
- `openpencil documents` is now a command group: list open documents with `openpencil documents list`.
- `CORNER_ROTATE_ZONE` is removed from `@open-pencil/core/constants`; the selection's resize and rotation zones are `TRANSFORM_ZONE` and `transformZoneAt` in `@open-pencil/core/geometry`, which also owns the `HandlePosition` and `CornerPosition` types.
- The MCP `close_file` tool no longer asks in the app whether to save unsaved changes, a question an agent could not answer and that left the call timing out. With unsaved changes it now fails unless `unsaved` is `"save"` or `"discard"`, and it is marked as a write tool.
- OpenPencil's plugin-data keys are defined once in `OPEN_PENCIL_PLUGIN_DATA` from `@open-pencil/scene-graph`, each with the schema that reads and writes it, and read or replaced with `readPluginData` and `withPluginData`. `@open-pencil/fig/node-change` no longer exports `OPEN_PENCIL_PLUGIN_ID` (now in `@open-pencil/scene-graph`), the `*_PLUGIN_KEY` constants, `upsertPluginData`, `removePluginData`, or `getOpenPencilPluginValue`; read a `.fig` record's value with `readNodeChangePluginData`. `@open-pencil/core` no longer exports `SOURCE_LIBRARY_PUBLICATION_PLUGIN_KEY`, and `SourceLibraryPublication` moved to `@open-pencil/scene-graph`.
- `fractionalPosition`, `orderKeyBetween`, and `siblingOrderKeys` moved from `@open-pencil/fig/node-change` to `@open-pencil/scene-graph/order-keys`; the `@open-pencil/core` root still exports `fractionalPosition`. `orderKeyBetween` now always returns a key: when no printable key sorts between its bounds it returns a key above `lo`, which `hasOrderKeyBetween` detects, and it takes an optional suffix that `siblingOrderKeys` can request through `{ suffix }`.
- The desktop app requires macOS 13 or later; the web app supports Chrome 111, Edge 111, Firefox 128, and Safari 16.4 or later.
- Shared rooms record the layer tree in a new format, so people on this version and on earlier versions can no longer join each other's rooms. A room this browser saved with an earlier version converts when you open it again.
- A paint's `gradientTransform` follows Figma's convention everywhere, so gradients made in OpenPencil before this release draw differently. Build gradients with `linearGradientTransform` and `ellipticalGradientTransform` from the new `@open-pencil/scene-graph/gradient`, where `isGradientFill` and `GradientFillType` moved from `@open-pencil/core/geometry`; `linearGradientEndpoints` is removed.
- `.fig` files store colour-variable bindings in Figma's `colorVar`. A paint bound through the old `colorVariableBinding` field, which only OpenPencil wrote, reopens unbound. `VariableBinding`, `colorVariableBinding`, `encodeNodeChangeWithVariables`, `encodePaintWithVariableBinding`, and `encodeVarint` are removed from `@open-pencil/core` and `@open-pencil/core/kiwi`.
- In scripts, a text node's `fontSize`, `fontName`, `fontWeight`, `fills`, `letterSpacing`, `lineHeight`, and `textDecoration` read `figma.mixed` while its characters differ, as in Figma, and setting one restyles every character. `fills` is typed `readonly Fill[] | symbol`, so scripts that index it narrow it first.
- Update `openpencil-mcp` together with the app: the app renders `render` JSX itself and no longer accepts the pre-rendered tree earlier versions send. AI and MCP tools reject arguments they do not declare: `defineTool` from `@open-pencil/core/tools` takes a `v.strictObject` input. `close_file` fails on unsaved changes unless `unsaved` is `"save"` or `"discard"`, and `diff_create` and `diff_show` patches list JSX attributes such as `-rounded={8}`, with `diff_show` taking `attributes` instead of a JSON `props` object, so patches in the old format no longer apply. `openpencil documents` is now a command group: list open documents with `openpencil documents list`.
- `design_to_tokens` writes CSS custom properties named from each variable's code syntax or Tailwind namespace: its `tailwind` format is a Tailwind v4 `@theme`, the `json` format is removed, aliases stay `var()` references, and non-default modes go under their condition (`[data-theme="dark"]` by default).
- Design JSX moved from `@open-pencil/core` to the new `@open-pencil/design-jsx` package. Import elements, helpers, variables, `JSX_REFERENCE`, `buildComponent`, `sceneNodeToJSX`, and `selectionToJSX` from there; `@open-pencil/core` and `@open-pencil/core/design-jsx` keep only `renderJSX` and `renderTree`, `renderTreeNode` is removed in favor of `renderTree`, and the `@open-pencil/core/io/formats/jsx` subpath is gone.
- JSX export writes only OpenPencil JSX: `JSXFormat` and `JSXExportOptions` are removed, and Tailwind JSX comes from `sceneNodesToTailwindJSX(graph, nodeIds)` in `@open-pencil/dom-css` or `@open-pencil/dom-css/export`. `@open-pencil/dom-css` no longer requires `@open-pencil/core`, and `exportHTMLBundle` takes a font resolver in `fonts` instead of `'assets'`; build one on `exportWebFontFaceAssets` from `@open-pencil/core/text/web-font/assets` to keep font files in standalone exports.
- Shared primitives moved to `@open-pencil/scene-graph`: color conversion and management to `/color`, text and layout direction to `/text-direction`, `randomHex`, `randomInt`, and `randomIndex` to `/random`, `fractionalPosition` to `/order-keys`, and `@open-pencil/scene-graph/layout-guides` is now `/layout`. `@open-pencil/core/bytes` is removed in favor of `js-base64`; the `@open-pencil/core` root exports are unchanged.
- `SceneNode` has new required keys `textParagraphs`, `listSpacing`, `paragraphSpacing`, `paragraphIndent`, `hangingList`, `targetAspectRatio`, `isExposedInstance`, `strokeWeight`, `strokeAlign`, and `booleanOperation` (which may be `undefined`), so code that builds `SceneNode` objects itself must include them. `Stroke` extends `Fill`, so every stroke states a paint `type`, usually `'SOLID'`.
- `SceneNode.primaryAxisSizing` and `counterAxisSizing` are `AxisSizingMode` (`'FIXED' | 'HUG'`): fill is stored on the child, as `layoutGrow` and `layoutAlignSelf: 'STRETCH'`, as Figma stores it. Read and change per-axis sizing with `layoutSizing`, `layoutSizingOptions`, and `layoutSizingUpdates` from `@open-pencil/scene-graph`.
- `.fig` reading moved to one reader. `importNodeChanges` and `importClipboardNodes` are replaced by `parseFigFile` and `parseFigmaClipboard`, `populateLazyFigImportRoots` and `populateAllLazyFigImportRoots` by `populateFigPage` and `populateAllFigPages` from `@open-pencil/core/io/formats/fig`, and `populateAndApplyOverrides` by `interpretInstance` with `materializeInstance`; `assertFigPackageReady()` is gone and `FIG_PACKAGE_STATUS` reads `document-reader`. `.fig` export takes text shaping from a runtime: `buildDerivedTextDataV4` is removed, `sceneNodeToKiwi` needs the `runtime` that `withFigExportRuntime(graph, canvasKit, write)` passes to its callback, and `FigNodeChangeExportRuntime` takes `shapeText(node)` instead of `getGlyphOutlineMetrics`.
- OpenPencil's plugin-data keys are defined once in `OPEN_PENCIL_PLUGIN_DATA` from `@open-pencil/scene-graph` and read or replaced with `readPluginData` and `withPluginData`. `@open-pencil/fig/node-change` drops `OPEN_PENCIL_PLUGIN_ID` (now in `@open-pencil/scene-graph`), the `*_PLUGIN_KEY` constants, `upsertPluginData`, `removePluginData`, and `getOpenPencilPluginValue` in favor of `readNodeChangePluginData`; `SourceLibraryPublication` moved to `@open-pencil/scene-graph` and `SOURCE_LIBRARY_PUBLICATION_PLUGIN_KEY` is gone.
- Every process mints layer, variable, and collection IDs in a random session, so `generateId()` no longer starts at `0:1` in the CLI, MCP, or scripts. Code that needs fixed IDs calls `setIdSession`, which now returns the previous session, or passes the `SceneGraph` its own generator (#770).
- Editor state gains required `canvasVersion`, which the canvas redraws on (call `requestRender()` instead of bumping `sceneVersion`), `shapeHandleHover`, and `selectionTheme`, which replaces `RulerTheme.label`. `remoteCursors` is now `presenceCursors` (`PresenceCursor[]`, each with a `kind` of `'person'` or `'agent'`), and the `Tool` type, `EDITOR_TOOLS`, and `TOOL_SHORTCUTS` include `'COMMENT'` on <kbd>C</kbd>.
- Canvas and constants APIs changed: `SceneGraph.hitTestFrame` is now `hitTestDropTarget`, `adoptNodesIntoSection` is now `adoptCoveredLayers`, and `SkiaRenderer.hitTestFrameTitle` no longer takes selected IDs. `SkiaRenderer.buildParagraph` returns a `TextLayout` that draws with `draw(canvas, x, y)`. `AUTO_LAYOUT_BREAK_THRESHOLD`, `getDefaultCanvasBgColor`, and `CANVAS_BG_COLOR_DARK` are removed, and `SECTION_DEFAULT_FILL` is replaced by `SECTION_DEFAULT_FILLS` and new pages use `PAGE_DEFAULT_BACKGROUNDS`, both keyed by interface theme. Icons come from an `IconProvider`: `fetchIcon`, `fetchIcons`, `searchIcons`, `searchIconsBatch`, and `clearIconCache` are replaced by the default `iconify` provider, `createIconifyProvider()`, and `placeIcon`, and `VectorizedPath` from `@open-pencil/core/vector` replaces `clipNetworks` with `clips`.
- `@open-pencil/vue` composables act on the whole selection: `useStrokeControls` and `useEffectsControls` no longer take a node, `useTypography` edits every selected text layer and its `weights` (also the `TypographyControlsRoot` slot prop) is a computed list of the families' weights, read with `.value`, and `usePosition` reports `x`, `y`, and `rotation` as Figma's panel does. `useVariables().collections` returns copies and `addVariable` returns the new ID; `useVariablesEditor`, `useVariablesTable`, `useVariablesDialogState`, and the `@tanstack/vue-table` dependency are removed. `useFlatReorderDrag` takes `operations` and `onCombine`, and the `updates` messages replace the system update dialog strings with the Software Update window's.

### Added

- Comment on designs, as in Figma: the **Comment** tool (<kbd>C</kbd>) pins threads to layers, with replies, resolving, rich text, and a searchable, filterable list in the sidebar. Comments are saved in the `.fig` file, so they travel through storage and shared rooms, and scripts, the AI chat, and MCP clients read, add, reply to, and resolve them.
- Be in several shared rooms at once, each in its own tab and syncing in the background, and talk with the people in a room in a peer-to-peer voice call from the headphones beside the avatars. Join from Home with **Join room…** or a pasted link, open a browser room in the desktop app with **Open in desktop app**, and join right away under a generated name such as *Teal Fox*.
- Follow collaborators and AI agents: avatars count each person's agents and show what they are doing, clicking follows them, and your own agents are followed while they work. Agents from the AI chat, ACP and Pi harness chats, and MCP clients show labeled cursors at the layers they touch, and the Pages panel and command palette show who is on each page. The command palette also lists recent pages and **Go to page…**.
- Create and fill slots, as in Figma, from the canvas, the properties panel, scripts, and AI and MCP tools: slots have names, limits, and preferred components, instances show each slot as Default or Modified, and **Reset slot** brings back the component's content.
- Create and edit component properties and variants from the properties panel, as in Figma (#847): link text, visibility, and swapped components to text, boolean, and instance swap properties, expose nested instances, reorder properties, and turn a component into a set with **Add variant**.
- Make components behave like real controls: the Behaviour section turns a component or set into a Button, Switch, Checkbox, Slider, Tabs, Text field, or another of 15 Reka UI-style controls, and **View → Preview** (<kbd>⌥</kbd><kbd>⌘</kbd><kbd>↩</kbd>) lets you use them live without changing the document. Scripts, AI and MCP tools, and design JSX build them too.
- Bulleted and numbered lists in text, as in Figma, with nesting, list and paragraph spacing, indents, and hanging markers, set from the Typography section or with <kbd>⇧</kbd><kbd>⌘</kbd><kbd>8</kbd> and <kbd>⇧</kbd><kbd>⌘</kbd><kbd>7</kbd>. Lists round-trip through `.fig` files, the Figma clipboard, HTML, design JSX, and scripts.
- Style selected characters while editing text: the Fill and Typography fields show and change the selection, as in Figma. Scripts style ranges with `getStyledTextSegments` and the `getRange`/`setRange` methods, design JSX writes `<Span>` and `<Paragraph>` with decoration style, colour, thickness, offset, and skip ink, and HTML, Tailwind, Vue, and React exports keep character styles and lists.
- Fill layers with shaders from the open-source [`shaders`](https://shaders.com) library: the fill picker's Shader tab stacks effects with generated controls and takes presets copied from shaders.com. The canvas shows the first frame and preview plays it where WebGPU is available; `.fig` files keep the frame as an image so Figma still opens them.
- Edit shapes on the canvas, as in Figma: gradient end points and stops while a gradient's picker is open, corner radius handles on rectangles, polygons, and stars, and a polygon's or star's point count and inner ratio, also in the properties panel.
- Lock a layer's aspect ratio beside its width and height, as in Figma; the lock survives `.fig` files and the clipboard and is available in the plugin API.
- Show the pixel grid when zoomed in, toggled with **View → Pixel Grid** or <kbd>⇧</kbd><kbd>'</kbd>, and snap moves, resizes, and drawing to whole pixels with **Snap to Pixel Grid** (<kbd>⇧</kbd><kbd>⌘</kbd><kbd>'</kbd>).
- Rearrange auto layout as in Figma: drag several layers along a row or column as one block, move a layer one slot with the arrow keys, take it out with **Ignore auto layout**, and see the layout's children outlined on hover.
- Edit several layers at once: a multi-selection gets Layout, Typography, corner radius, and stroke sections, plus **Selection colors**, which recolours a colour everywhere it is used.
- Check designs in the new Lint tab: issues are grouped by rule, marked on the canvas and in the Layers panel, and many have one-click fixes such as binding colours to matching variables. `openpencil lint --fix` and the `lint` and `lint_fix` tools apply the same fixes outside the app.
- Edit variables in a redesigned variables dialog: collections and groups in a sidebar, search across names and values, inline editing, drag to reorder, multi-select, CSS names and expressions, per-mode conditions written in plain words, and a live stylesheet preview.
- Import and export variables, text styles, and effect styles as W3C design tokens, in the shape Figma imports, from the variables dialog, `openpencil tokens --format dtcg`, and the `import_design_tokens` tool. Copy variables as CSS or a Tailwind v4 theme, or print them with `openpencil tokens`.
- Insert icons from Iconify's open-source sets with an icon picker in the toolbar, Object menu, and command palette. Placed icons keep their name, so the Icon section can swap or recolour them, and exports write them as icons.
- See the selection as a Vue or React component in the Code tab, styled with CSS or Tailwind, and see which layer the cursor's element draws, with design issues underlined in the code.
- Export components to Storybook with `openpencil export -f storybook`: one story file per component for React, Vue, or HTML, with variant controls, and with `--framework vue` or `--framework react`, working Reka UI or Radix UI components (#727). Export HTML and Tailwind JSX from the app and the CLI (`-f tailwind-jsx`), with vector shapes as inline SVG, and choose PPTX in the Export panel.
- Open a `.fig`, `.pen`, or other supported document by dragging it onto the window, paste SVG markup copied as text, such as Figma's Copy as SVG, and open HTML files in CLI commands such as `openpencil tree` and `openpencil convert`.
- Save the open document to cloud storage with **File → Save to storage…**; the tab stays bound to the stored copy, so Save and auto-save write to the bucket. A new Cloud Storage guide covers setup.
- Set up AI in a few steps with guided setup: on first launch, pick a coding agent on this computer, an API account, or a local server. The desktop app installs or updates agents, adapters, the MCP server, and the Harness companion, tests each connection, and proposes models, and the MCP server and Harness companion print their version with `--version`; sign in to OpenRouter instead of pasting a key.
- Choose how much an AI model thinks for each message, from Off to Extra high, attach images by dropping them on the chat, and watch designs appear on the canvas while direct providers stream JSX.
- Review and undo AI edits from the chat: each tool call shows a summary, its input and output, and a before-and-after image with a JSX diff. Revert a reply's edits, restore them, regenerate the last reply, retry a failed message, or edit and resend it; undoing an edit tells the AI on the next message.
- Control the running app from the CLI and MCP: `openpencil documents`, `undo`, `redo`, and `settings`, the matching MCP tools, `openpencil tool list`, `describe`, and `call` to run any MCP tool from the shell, and `openpencil diff` with the `diff_visual` and `diff_apply` tools to compare and replay changes. Share only the selected layers with MCP clients from **Settings → MCP → Local server** or `OPENPENCIL_MCP_SCOPE=selection`.
- Diagnose failures from **Settings → Diagnostics**: errors, failed AI chats, and broken tool calls are recorded with scrubbed messages and stacks, filterable and copyable with the app version.
- Choose an accent color in **Settings → General → Appearance**, and customize the toolbar in **Settings → Toolbar** or from its right-click menu: hide, reorder, and regroup tools on desktop and mobile.
- Use more of the Figma plugin API: `instance.swapComponent()`, `detachInstance()`, `figma.getNodeByIdAsync()`, and `getMainComponentAsync()`. OpenPencil's own `openpencil` script global adds comments and controls.
- Write design JSX with more of the document: `visible`, `locked`, `constraints`, `italic`, full stroke props, and component properties set by name on `<Instance>` (#750). JSX export writes them back with every fill, effect, mask, and variable binding, and TSX can use `@open-pencil/design-jsx` as its JSX import source.
- New SDK entry points: pass an ID generator to `new SceneGraph()`, place pasted content with `resolvePasteTarget` from `@open-pencil/core/editor`, compute Flatten and Outline stroke with `flattenNodesToVectorProps` and `outlineStrokeNodesToVectorProps` from `@open-pencil/core/canvas`, and import `designDocumentToSceneGraph` from `@open-pencil/dom-css/scene-graph` in browser builds.
- New npm packages: `@open-pencil/design-jsx` for writing and exporting design JSX, and `@open-pencil/emit`, which it and the exporters use to print source code.

### Changed

- A selected layer resizes and rotates where Figma's does: every edge resizes along its whole length within 7.5 px outside it and up to a tenth of the side inside it, corners within 7.5 px, and the area outside a corner within 16 px rotates; a frame's name takes a press before rotation but not before resizing. Layers under 24 px keep these zones outside them, and a layer under 10 px on both sides has none, taking presses within 16 px across its centre instead. A selection draws Figma's four corner handles, without the edge midpoints, and none on such a small layer.
- The font weight list offers only the weights the text's family has, as Figma's style list does, read from installed fonts and web font providers; a family whose faces cannot be read still offers all nine. Switching family keeps the weight and italic where the new family has them, otherwise takes the nearest weight with the same slant, so Inter Black becomes Lora Bold, and Bold and Italic toggles leave text alone when its family has no such face.
- The plugin API refuses to move, rotate, constrain, or mask a layer an instance takes from its component, with Figma's errors, such as `in set_x: This property cannot be overridden in an instance: relative-transform`. Those fields always follow the component. Slot content stays editable, and editing a slot's default content makes the instance own it, as in Figma.
- A layer dragged out of an auto layout frame leaves it as in Figma, once its edge is 5 px past the frame across the flow or about 15 px along it, instead of after the cursor travels 96 px beyond it.
- Bound variables show as a neutral chip in the properties panel instead of purple text, so they no longer read as components.
- Import SVG as editable layers, as pasting it into Figma does, from `import_svg`, dropped files, and pasted markup ([#734](https://github.com/open-pencil/open-pencil/issues/734)). Each `<g>` becomes a group, each shape its own vector, and each `<text>` a text layer with its fonts, `<tspan>` styles, alignment, and rotation, named after its `id`, element opacity is kept, and clipped content sits in a clip path group whose mask is drawn from the clip's shapes. The imported frame is white, clips its content, and is named after the root `<svg>` `id`; an SVG without a size imports as a group. Shapes are no longer merged into one multi-color vector.
- With **Snap to Pixel Grid** on, moved layers and resized edges land on whole pixels at any zoom, and drawn layers start and end on whole pixels, as in Figma; zoomed in, moves and resizes could leave fractions before, and drawing was not snapped.
- Layers inside components and instances are outlined in purple when hovered or selected, with a purple size label, as in Figma; they were blue.
- The properties panel's variable picker groups variables by collection and shows each color variable's swatch, and the variables dialog points a value at another variable with the same picker, detaching it from the picker's footer.
- **Add variant** on a component set copies its last variant below it, 20 px apart, with the next free value such as `Variant3`, and grows the set to hold it, as Figma does. It used to place a copy with the same values to the right, which made a duplicate combination.
- The `get_selection` tool returns the selected layers with their direct children by default instead of their whole subtrees, and takes a `depth` for more or fewer levels, so agents can start from what the user selected without reading the full tree.
- The width and height menus in the properties panel offer Hug only for auto-layout frames and text, as in Figma; on a frame without auto layout it had no effect.
- Confirm deleting an AI conversation in the standard confirmation dialog, which names the conversation, instead of a prompt inside the chat panel.
- Run Pi with the providers you signed in to in the Pi CLI and Pi's default model, so an AI Gateway key and a model ID are optional. The Pi model editor shows whether the Harness companion and MCP server are installed and match the app, and a chat whose Harness companion is missing, or whose companion or MCP server does not match the app, says what to fix and offers guided setup instead of failing with a generic error, and the message and its attachments stay in the composer.
- Point Codex install instructions at `@agentclientprotocol/codex-acp`, which replaces `@zed-industries/codex-acp` and provides the same `codex-acp` command.
- The desktop app shows an available update in a Software Update window with formatted, scrollable release notes, a link to the full notes, and download progress you can cancel, instead of a system dialog that showed raw Markdown and could grow taller than the screen (#743). On macOS and Linux the update installs first and you choose when to restart; restarting, and on Windows installing, first asks about unsaved documents as Quit does.
- Show Go to main component and Detach instance as buttons in an instance's panel header instead of a row of links below it.
- `openpencil eval` prints the value of a script's last expression, as the `eval` tool and app automation already do, so `-c 'figma.currentPage.children.length'` prints the count without a `return`.
- In scripts, children of groups and booleans report `x`, `y`, and `relativeTransform` in their container's space, as in Figma, and a group refits whenever a script moves, resizes, rotates, adds, or removes one of its children; a group left without children is removed, and a group with a mask spans the mask and the layers below it, not the masked layers. The canvas and the plugin API share the refit.
- The properties panel shows and edits X, Y, and rotation as Figma's does: X and Y are the top-left of a turned layer's box on the canvas, measured from its frame or page through any groups, rotation is counterclockwise, and a typed rotation turns the layer about its center. Previously a layer Figma shows at 30° read −30°, and a turned layer's X and Y were those of its unturned box.
- New pages and new documents take Figma's background for the interface theme: #1E1E1E in the dark theme and #F5F5F5 in the light one, from the canvas and from scripts. Existing pages keep theirs.
- In scripts, layers turn, move, and resize as in Figma: `rotation` turns a layer counterclockwise about its top-left corner, `x` and `y` are that corner in the parent, `resize()` keeps it in place, `relativeTransform` can be set, and `absoluteBoundingBox` covers the turned layer. `appendChild()` and `insertChild()` keep a layer's `x`, `y`, and rotation in its new parent, so it moves with that parent, instead of keeping its place on the canvas. The AI and MCP `create_shape`, `create_slice`, and vector tools likewise place a layer given a `parent_id` at `x` and `y` inside that parent, and `reparent_node` keeps its position inside the new parent.
- A layer keeps its stroke weight and alignment without strokes, as in Figma: a weight or alignment set before adding a stroke, or kept after removing them, applies to the next stroke, survives `.fig` export and import, and scales with `rescale()`. `strokeWeight` and `strokeAlign` in scripts apply to every stroke rather than the first, and a stroke added from the panel takes the layer's weight and alignment. New strokes align inside, centered on lines and vectors, and outside text.
- Boolean operations take the size of the shape they produce, as in Figma, from the canvas and from scripts when a renderer is attached, and refit when an operand moves; an empty result keeps its operands' size.
- New sections look as in Figma: white, or #444444 in the dark theme, with a faint white outline and 2 px corners, 496 px square from scripts. Sections and component sets are drawn with their own corner radius instead of a fixed 5 px.
- Layers drawn on the canvas and the groups, frames, and components it wraps layers in are numbered as in Figma, one past the highest number used for that name on the page, as in "Rectangle 2" or "Group 10"; scripts keep plain names.
- Group, Frame selection, Create component, and boolean operations match Figma from the canvas and from scripts, through one shared implementation. From the canvas, the new layer takes the topmost selected layer's place in the layer list, Frame selection adds no fill and does not clip, a component wrapped around layers is white and takes a single layer's name, and a boolean is filled like its topmost operand, or its base for Subtract, without strokes. In scripts, `figma.ungroup()` leaves the children in the group's place instead of moving them to the top, booleans are named Union, Subtract, Intersect, or Exclude with the default grey fill, and `figma.createComponentFromNode()` turns a frame or group into a component that keeps its children instead of copying them, and wraps any other layer. Undoing a group or boolean returns each layer to its own place in the layer list.
- Combine as variants matches Figma: the set pads its variants by 20 px and has a dashed purple stroke instead of a grey fill and 40 px of padding, and `figma.combineAsVariants()` in scripts wraps the components exactly with no fill or stroke, as Figma's plugin API does. Both share one implementation.
- New layers start as in Figma, whether drawn or created by a script: frames are white and clip their content, components are white, shapes are #D9D9D9, and lines and vectors get a black 1 px stroke. The Line tool draws a line from the start point to the cursor by its length and angle, as in Figma, instead of an invisible box, and Shift snaps it to 45° steps. A stroke a script adds through the plugin API now gets Figma's 1 px default weight instead of none.
- `createInstance()` and `detachInstance()` in the plugin API return the node type they built, so reading `componentProperties`, `setProperties`, or `isExposedInstance` from a new instance no longer needs a cast; `FigmaInstanceNode` is exported alongside the other node types.
- Name the tool and list every invalid argument with where it is when AI chat, the CLI, or WebMCP calls a tool wrongly, as MCP clients already saw, as in `Invalid arguments for create_shape:` followed by `× Invalid type: Expected ("FRAME" | …) but received "CIRCLE"` and `→ at type`. Design JSX component properties and gradient stops report their problems the same way. Previously only the first problem was named, without the tool or the argument.
- HTML and Tailwind JSX export write variable-bound colors, spacing, radii, borders, sizes, type sizes, and opacity as the tokens they come from, such as `var(--color-primary)` or `bg-primary`, and put layers set to another mode in it with an attribute such as `data-theme="dark"`. Values CSS would not resolve as the canvas draws them stay literal, and standalone HTML includes the stylesheet for the tokens it uses.
- Clicking selects layers as in Figma: inside a top-level frame or section, a click selects the frame's direct child rather than the deepest layer, the empty part of a top-level frame or section that holds layers selects nothing, while the gaps and padding of a top-level auto layout frame select, highlight, and drag it, and a frame inside a top-level frame, or an empty frame, is selected by its empty area even without a fill, which ⌘-click looks through, so every top-level frame shows its name above it, in the selection color while selected or hovered, and clicking or dragging the name selects or moves the frame; once a layer is selected, clicks reach its siblings and cousins. Double-click goes one level deeper, as does another click inside a selected frame, component, or instance, so repeated clicks at one point reach the layer under it; ⌘-click (Ctrl-click on Windows and Linux) selects the deepest layer, which holding ⌘ highlights. Double-clicking a frame's or component's name renames it in place. A layer is never selected together with its own parent or child: Shift-clicking one replaces the other. A marquee started inside a top-level frame or section selects that container's layers, and from the page it selects a frame or section that holds layers only when fully enclosed.
- Drag, draw, duplicate, and paste follow Figma. A dragged layer lands in the frame under the cursor and leaves its frame as soon as the cursor does; groups and locked frames never take a drop, a component set takes back only its own variants, and a layer inside a group stays in it unless dropped on another frame. Groups and booleans fit their children after a move or nudge, and a group whose last layer leaves is removed. Pressing inside a selected frame, group, or component set drags it rather than the layer under the cursor, and an auto layout child dragged out lands where you drop it. Hold Space while dragging to keep layers in their parents, Shift to move along one axis, or Control to drop into auto layout as an absolute-positioned layer. Locked layers stay put when the rest of the selection moves. Shapes drawn inside a frame, auto layout, or slot go into it, a frame drawn over layers takes in the ones it fully covers, and a section does so when moved or resized too. Wrapped auto layout inserts on the line under the cursor. Duplicates keep their names, and duplicating a main component with ⌘D or Alt-drag creates an instance. ⌘D duplicates in place, placing a lone top-level frame's copy to its right, and ⌘V keeps the copied position, in the browser too, centering an axis that doesn't fit the selected frame, and an instance pasted into its own main component, or into a layer inside it, lands over that layer in the component's parent instead of inside it; **Paste here** still pastes at the cursor.
- Give popovers, menus, dropdowns, and pickers one look and motion: the same rounded panel with a thin outline that reads in light and dark themes, a short fade and grow from the side they open on, and an immediate close; with reduced motion they appear at once.
- Selects open over their field with the chosen option on the field's label, so the value stays in place, and lists use the window's height instead of scrolling after nine rows. Menus behind a chevron or icon, such as the size, gap, and line height modes, open under it with the same rows and check marks. Blend modes are grouped by effect.
- Add and remove items the same way across the properties panel: a section's + adds an item and a row's − removes it, now including grid columns and rows and variant properties. The + of a component set adds Property 1 ready to rename instead of showing a form, and a variant is removed with Delete like any layer.
- Pick variables, shared styles, and swap components from one searchable list that groups preferred components first and works with the keyboard.
- Recommend the latest models in the AI model picker: Claude Sonnet 5.5 (the new Anthropic and OpenRouter default), Claude Opus 5.5, GPT-6.1 Sol (the new OpenAI default), GPT-6 Astra, and GPT-6 Luna, and replace the free OpenRouter models OpenRouter retired with Qwen3.8 27B and Gemma 4 31B. Saved profiles keep the model they chose.
- The Linux AppImage no longer bundles `xdg-open`; opening links relies on the system's `xdg-utils`, as most desktop distributions provide.
- With nothing selected, the Code tab explains that it shows the selection's code and offers Write JSX for new layers, instead of showing a template frame that looked like a real layer.
- Design lint reports far fewer false positives in `openpencil lint` and the app: `no-hardcoded-colors` flags only colors that match a color variable and names it, `no-deeply-nested` flags only the layer that crosses the depth limit, `touch-target-size` checks the WCAG 2.2 AA minimum of 24 × 24 in the Recommended preset (Strict and Accessibility keep 44 × 44), matches control names as whole words (a layer named "Rectangle" is no longer a call to action) and ignores icons and controls inside other controls, `consistent-spacing` accepts multiples of 4, `color-contrast` checks text bound to color variables, and layers inside instances are checked once through their main component. The Recommended preset reports unbound colors, deep nesting, mixed text styles, and off-scale spacing as suggestions instead of warnings. Lint messages carry the measured values in `data`.
- Keep the Share button labeled Share while you are in a room, instead of turning it into a Connected status; a green dot on your avatar shows the room is live.
- Show Flatten, Outline text, and Outline stroke in the canvas context menu without icons, like every other item there.
- The AI chat starts with more tools turned on: comments (`get_comments`, `add_comment`, `reply_to_comment`, `resolve_comment`), variables (`list_variables`, `create_collection`, `create_variable`, `set_variable`, `bind_variable`), `lint` and `lint_fix`, `export_image` to look at its result, and `list_pages` and `create_page`. Before, it could reach these only through `eval` or after turning them on under Settings → Tool access, so when asked for a comment, it drew a note layer instead. Tools you turned off stay off.
- The design JSX reference, which the AI chat, MCP clients, and the agent skill read, says to build repeated content such as a calendar's days with JavaScript inside `{}`, `{days.map(…)}` or `Array.from(…)`, instead of writing each item out. When JSX with several top-level elements uses an undefined name, the error now adds that a statement such as `const` before the JSX does not run, and how to compute the value inside it, instead of only `days is not defined`.
- Keep an AI chat working on the page where it started when you switch to another page, instead of sending its next edits to whichever page is on screen. When the AI switches pages itself, your view follows.
- `openpencil://` and web `?node=` links select the layer on another page when the current page has none, switching to that page.
- Generate Tailwind JSX with the same class mapping as Tailwind HTML export, so both describe a design the same way, and write opaque colors as hex in HTML, CSS, and Tailwind output. `openpencil export -f jsx --style tailwind` now exports a whole page when no `--node` is given.
- Show download progress with a percentage and transferred size while installing a desktop update, instead of an indeterminate message that lasted until the restart.
- Opening a share link or joining a room opens it in a tab of its own, so a document you already have open is never changed. Until the room's file arrives the tab says it is joining or, when nobody who has the file is online, explains why it is waiting; reloading rejoins, and leaving a room you joined keeps its file as a local unsaved copy.
- Text in the dark and light themes meets the WCAG AA contrast ratio of 4.5:1. The dark theme's blue fills are deeper, and its blue, purple, pink, and red text is lighter. Light-theme secondary text and warning amber are darker, and hidden layers in the Layers panel dim less.
- The font weight list offers only the weights the text's family has, as in Figma. Switching family keeps the weight and italic where the new family has them, otherwise the nearest weight with the same slant.
- Selecting, dragging, drawing, duplicating, and pasting follow Figma: clicks select a top-level frame's direct children and double-clicks go deeper, dragged layers land in the frame under the cursor, groups and locked frames never take a drop, and Space, Shift, and Control change how a drag reparents. A layer leaves auto layout once its edge is about 5 px past the frame instead of after the cursor travels 96 px.
- Layers move and turn as in Figma, on the canvas and in scripts: the properties panel shows X and Y of a turned layer's box and a counterclockwise rotation, children of groups report positions in their container, and groups and booleans refit to their contents.
- New layers, pages, and sections look as in Figma: white frames that clip, #D9D9D9 shapes, black 1 px lines, theme-aware page backgrounds and sections, numbered names such as "Rectangle 2", and Figma's results for Group, Frame selection, Create component, booleans, and Combine as variants.
- A layer keeps its stroke weight and alignment without strokes, as in Figma, and strokes take the same paints fills have, including gradients and images (#797).
- Layers inside components and instances are outlined in purple, and bound variables show as a neutral chip instead of purple text.
- Import SVG as editable layers, as pasting into Figma does: groups, one vector per shape, text layers, and clip path groups instead of one merged vector (#734).
- The plugin API refuses to move, rotate, constrain, or mask a layer an instance takes from its component, with Figma's errors; slot content stays editable.
- Popovers, menus, selects, and pickers share one look and motion, selects open over their field, every section adds and removes items with + and −, and variables, styles, and swap components come from one searchable list.
- The desktop app shows updates in a Software Update window with formatted release notes and cancellable download progress (#743). On macOS and Linux you choose when to restart, and restarting asks about unsaved documents first.
- Design lint reports far fewer false positives, checks touch targets against WCAG 2.2 AA in the Recommended preset, and reports unbound colours and off-scale spacing as suggestions.
- HTML and Tailwind export write variable-bound values as their tokens, such as `var(--color-primary)` or `bg-primary`, and Tailwind JSX uses the same class mapping as Tailwind HTML.
- The AI chat starts with comment, variable, lint, page, and image export tools on, keeps working on the page where it started, and recommends the latest models, with Claude Sonnet 5.5 and GPT-6.1 Sol as the new defaults. Saved profiles keep their model.
- Invalid tool arguments from the AI chat, CLI, or WebMCP name the tool and list every problem with its location.
- Run Pi with the providers and default model you signed in to in the Pi CLI, and see what to fix when its Harness companion or MCP server is missing or out of date. Codex install instructions point at `@agentclientprotocol/codex-acp`, which replaces `@zed-industries/codex-acp`.
- `get_selection` returns the selected layers with their direct children by default and takes a `depth`, and `openpencil eval` prints the value of a script's last expression.
- Opening a share link opens the room in its own tab, so an open document is never changed, and leaving a room keeps its file as a local copy.
- Text in both themes meets the WCAG AA contrast ratio of 4.5:1.
- The Linux AppImage no longer bundles `xdg-open` and relies on the system's `xdg-utils`.

### Fixed

- Instances follow their component as in Figma: style overrides from `.fig` files survive component edits, every field an instance does not override follows the component, restructured component layers move their instance copies with overrides, and properties set on nested instances show and stay set when pages load on their own (#849).
- Save `.fig` files that open correctly in Figma: overrides beyond text and fill colour, exposed nested instances, slot content, blend modes, bound variable values, variable metadata, fill-sizing, ordering keys, and stable layer IDs (#890). An opened `.fig` stays unchanged until edited, saves before its first edit, and saves variable-only edits.
- Text saved to `.fig` or copied to Figma keeps its wrapping, alignment, line height, ligatures, and decorations there (#914), and shows there when drawn in a fallback, missing, or variable font or truncated. Auto line height stays auto when `.fig` files are opened and saved, so text with mixed font sizes keeps its lines.
- Auto layout behaves as in Figma: Fill children in Hug frames keep their size, frames from `.fig` files reflow when edited, absolute children follow constraints, Hug frames grow while typing, and undo puts back everything an auto layout change moved.
- Draw like Figma: gradients from Figma files and pastes no longer run backwards, blurs and shadows use Figma's falloff, masks apply their opacity and blur, layers masked by a group show, and polygons and stars keep their rounded corners, point count, and inner ratio, also when copied to Figma.
- Underlines and strikethroughs follow the font's metrics and Figma's styles, outlined or flattened text keeps its glyph positions, and fonts load reliably: styles of variable fonts and macOS font collections, CJK and Arabic fallbacks, and a clear notice for unsupported outlines such as PingFang (#746, #752).
- Import HTML and CSS laid out as a browser lays it out, with correct shadows, borders, and `box-sizing`, in `openpencil import`, the app, and the Code tab's preview (#788).
- Import SVG files with an XML declaration, `fill-opacity`, `stroke-opacity`, open filled subpaths, and stroke caps and joins that survive saving.
- Design JSX lays out `justifyContent`, `alignItems`, grid `repeat()` tracks, fill sizes in grids, and `box-shadow` lists as written, applies props it used to ignore, reports bad gradient arguments, warns about ignored paint and effect options (#736), and keeps line breaks when exporting multi-line text.
- The plugin API reads and writes `lineHeight`, `letterSpacing`, effects, paints, page backgrounds, and `componentPropertyReferences` in Figma's shapes, updates geometry and text size immediately, and refuses invalid sizing and component cycles as Figma does (#786).
- AI, MCP, and CLI tools reject arguments they do not take (#977), keep variable bindings through stdio `render` (#830), size groups and booleans to their contents (#738), work on pages other than the one on screen, run XPath queries under Node (#787), judge text contrast by its WCAG ratio (#735), and report failed saves as errors.
- Undo covers layers MCP clients, the CLI, and AI chat create, delete, or move, including on other pages and in variables, and undo and redo work while a colour picker is open.
- AI chat replies stop cleanly, survive switching pages, accept `eval` results of any shape, use a newly saved API key right away, and keep your message when the chat cannot start. Pi chats start with OpenPencil's MCP tools on Node 22.15 or later and resume cleanly.
- Shared rooms keep one consistent layer tree when people move, reorder, or add layers at the same time (#888, #889).
- Storage keeps working: browser storage saves after Safari suspends a tab, in Private Browsing, and for documents over 127 MiB; crash recovery and autosave run after edits instead of on redraws, which froze Safari; and S3 storage works with servers that answer range reads with `200`, such as `rclone serve s3`.
- Memory stays flat during long AI and MCP sessions (#587), image-heavy `.fig` files open without running out of memory (#924), and closing a tab releases its document.
- Show a clear message instead of a blank window when the browser or WebView is too old, and start on macOS 13 with older WebKit (#744).
- HTML export keeps grid layouts, rotation, every shadow and blur, flex grow, right-to-left direction, sections, and the positions of layers outside auto layout, and declares `box-sizing: border-box`.
- Picking an OkHCL colour no longer overwrites a layer's other plugin data, including other plugins' data and its export settings.
- Smaller fixes: layers keep their place when moved into or out of a rotated or flipped parent (#737), the Vue SDK's `CanvasSurface` starts, `.pen` text sizes from its font, whole-step number field drags, ⌘Z after nudges, ⇧-resizing, Paste here in transformed frames, zooming to a fixed level, the font picker's starting position and search order, section and frame titles, tab and menubar overflow, tooltips, full hex and opacity values, component set borders at every zoom, the caret in empty text, imported page backgrounds, `.fig` thumbnails in recent files, the canvas context menu closing on a quick second right-click, model pickers in Settings → Models closing while the editor slides in, and screen reader labels.
- Ship the MIT license text in every npm package, with READMEs for `@open-pencil/core`, `@open-pencil/cli`, and `@open-pencil/mcp`.

### Performance

- Open large `.fig` files with a fraction of the memory: the Nuxt UI design kit takes 0.7 GB instead of 2.2 GB, and pages share unchanged component data and JavaScriptCore object layouts.
- Save an edited `.fig` by rewriting only the layers that changed, off the main thread in the browser: the 109 MB Preline UI kit saves in about 3 seconds instead of over two minutes, with about 1.5 GB less memory on large kits.
- Open multi-page `.fig` documents, lay out pages with many text layers and instances, and edit text selections and variables without long freezes or full redraws.
- Open the `/demo` document instantly, built ahead of time instead of in the browser.

### Security

- Limit what the desktop app may write and run: no writes to startup locations, shell profiles, global package folders, or MCP discovery files, and only the exact command lines of supported agents, the MCP server, and the Harness companion.
- Update to Tauri 2.12, which binds large IPC responses to the requesting webview (GHSA-w28w-mhc8-qvjv), and install desktop updates only when the signature names the announced version.
- Evaluate `calc` through `jsep` and an arithmetic allowlist instead of `expr-eval`, which had an unpatched code-execution advisory (GHSA-q9v2-7m5w-4693); `calc` now supports `**` and nothing it does not document.
- Escape layer names and text in JSX and Tailwind JSX export, so document text cannot inject attributes or expressions into `render` and `replace`.
- Validate collaborator cursors and names, clipboard data, component library revisions, and MCP and automation messages before using them, and update `@xmldom/xmldom` to 0.9.12, which fixes quadratic parsing of crafted SVG and XML.

## 0.15.1 — 2026-09-18

### Added

- Configure built-in AI and local MCP tool access independently on a Tool access page, including optional extended AI tools, searchable read-only and side-effect groups, and per-target defaults (#584).
- Set the built-in AI's maximum steps per message in Chat settings, including a custom number, with consistent stopping and remaining-step warnings (#573).
- Open documents and jump to a named layer from `openpencil://open?file=&node=` links, resolving the file against open tabs or a one-time file picker. Path segments match the way the filesystem does: case-insensitively on macOS and Windows, exactly on Linux.
- Open documents and jump to a named layer in the web app from `?file=&node=` links, fetching the file from an `https:` URL without credentials, ignoring the URL fragment, and refusing a document larger than 64 MiB — a ceiling the automation bridge's `openFile` now shares.

### Changed

- Create new documents with the sRGB colour profile, so Display P3 is reserved for documents that declare it.
- Export diagnostics from Settings only, with a retention count you choose. AI requests and tool activity now carry conversation and request identifiers, while chat no longer offers a separate diagnostic log or includes transcript content.
- Replace the demo's legacy reference page with a component library on the first page, including component sets, linked instances, component properties, and the variable collections, and show the standard canvas loading overlay and tab indicator while it is generated instead of an empty canvas.

### Fixed

- Store colours edited in the colour picker in the document's colour profile, and convert them on the way to the display, so a Display-P3 document no longer looks different on an sRGB display than on a wide-gamut one.
- Keep Display-P3 documents rendering correctly in wide gamut where the browser supports it and in sRGB elsewhere, fixing the black rectangles and incorrect blend colours, with a dismissible notice when wide gamut is unavailable.
- Classify MCP `open_file` and `close_file` operations as read-only hints, and close opened document tabs through the new `close_file` tool with the usual unsaved-change prompt.
- Let the desktop app use an MCP server you started yourself by allowing the app's own origin by default, instead of requiring `OPENPENCIL_MCP_CORS_ORIGIN`.
- Explain why the local MCP server did not start — a missing `@open-pencil/mcp` install, a denied command, an early exit, or an unreachable address — with translated guidance, and find a globally installed server when the desktop app is launched from the system shell.
- Animate the AI chat tool-call disclosure, which expanded and collapsed without motion because its animation classes were misspelled.
- Mark unsaved documents and ask whether to save before closing a tab, the desktop window, or the application, rather than relying on recovery alone.
- Defer AI provider connections and system credential reads until you send a message or use a connected feature, so opening documents and browsing chat history no longer trigger unexpected credential prompts.
- Save and recover documents whose text uses disabled numeric, fraction, or small-caps OpenType features, which previously failed to write a `.fig` file.
- Update instance text properties on the canvas while typing, with grouped undo for rapid edits.
- Point Homebrew installation instructions to the official `openpencil` cask and document separate CLI installation.
- Reach the custom model option in the model picker for providers with large model catalogs instead of requiring a search for it.

### Performance

- Reduce editor pauses while generating recovery snapshots and exporting text-heavy `.fig` documents.
- Recompute layout only for the pages an edit affects, instead of every page, when editing a component or its instances.

## 0.15.0 — 2026-09-16

### Breaking changes

- Use MCP SDK v2 server/client types for programmatic MCP integrations. Define custom tools with native Valibot `input` schemas and execution metadata instead of `params`, `ParamDef`, or `paramToZod()`.
- Replace Scene Graph `overrides` records with `instanceOverrides`, using separate `self` and `descendants` maps. Rename `figmaDerivedLayout`, `figmaDerivedTextGlyphs`, and `FigmaDerivedTextGlyph` to `derivedLayout`, `derivedTextGlyphs`, and `DerivedTextGlyph`.
- Update custom Vue SDK binding providers to implement `getBindingId()` and handle `unresolved`. Replace `setValue()` with `prepareEdit()`, returning a stable edit key, captured value, setter, and restoration callback.
- Replace Vue SDK `useDialogMessages()`, `dialogMessages`, and their catalog keys with the corresponding product-domain message composables and catalogs.
- Use Vue 3.5.41 or newer within Vue 3 for the Vue SDK, and CanvasKit 0.41.1 or newer when supplying its optional CanvasKit peer. Update custom CanvasKit integrations to use `PathBuilder` and immutable `Path` operations.

### Added

- Expose design inspection and undoable layer-property and variable edits to browser agents through experimental WebMCP in supporting browsers, with explicit Off, Inspect, and Edit access controls in Settings.
- Control custom tool exposure independently through `mcp`, `ai`, and `webmcp` exclusions. Tools are included by default, subject to execution support and user permissions.
- Bind Design JSX spacing, sizing, corners, and typography directly to numeric document variables.
- Define component properties and assign instance values in Design JSX using stable property IDs.
- Save AI conversations and attachment previews locally, switch between chats, rename or delete them, and browse saved transcripts across documents. Choose whether reasoning stays collapsed, expands while thinking, or stays expanded, with animated disclosure controls that respect reduced motion.
- Add a searchable command palette for editor and application actions.
- Search current AI provider catalogs from model pickers, with curated recommendations, recent compatible models, and offline fallbacks.
- Render triangle and line arrow stroke caps on lines and open vector paths, and choose them from the stroke cap picker.
- Expose component properties and instance-swap targets through the Figma API and automation.
- Create, select, move, duplicate, transfer, and delete canvas and frame guides directly from rulers, with undoable edits, measurements, context-menu actions, and `.fig` round-trip fidelity.
- Open to a unified home with recent and configured storage documents in grid or list layouts, and open multiple selected design files in separate tabs.
- Snap vector points, moved layers, and resized edges to nearby geometry, guides, frame and canvas bounds, and whole-pixel coordinates, with visible alignment guides and persistent snapping preferences.
- Run Pi through AI SDK HarnessAgent as a configurable desktop provider with saved model profiles, secure credentials, existing MCP design tools, and per-profile thinking and permission settings.
- Combine components into variant sets through Figma API scripts and automation.
- Add local AI usage and technical diagnostics, including token telemetry, provider/model summaries, recent failures, configurable retention, export, and clear controls (#588).
- Import, render, edit, resize, select, and export Figma text-on-path layers while preserving their curved glyph layout.
- Show temporary Figma-style distance measurements between selected and Option/Alt-hovered layers (#491).
- Edit Design JSX and HTML/CSS previews in CodeMirror, with theme-aware highlighting, Tailwind viewing, completion, diagnostics, bounded execution, and session-level undo (#130).
- Set provider-specific reasoning effort on supported AI model profiles (#454).
- Show unavailable or substituted document fonts with affected-layer selection and retry actions, and expose font fidelity through the Figma API, MCP, and `openpencil fonts [file] --json`. Choose `warn`, `strict`, or `allow` font-substitution policies for file-backed CLI raster and PDF exports with `--font-policy` (#503, #625).
- Add reusable remote MCP connections for ACP agents, with Streamable HTTP endpoints and credential-backed bearer tokens.
- Author and manage multidimensional component variants and published component libraries, including revision previews, linked-instance updates, stable library identities, offline catalogs, storage-backed catalogs, and read-only library definitions (#239).
- Recover unsaved and pathless documents locally, including after closing their tabs, with options to disable recovery and restore or discard retained snapshots (#487, #505, #574).
- Inspect selected designs with a configured Vision model and attach images to AI chat with bounded analysis and previews (#232, #471).
- Pin selected layers as explicit AI chat context, show collapsible reasoning, copy individual responses, and grow the composer with multiline prompts (#13).

### Changed

- Refresh the OpenPencil mark across the editor, documentation, browser tabs, installed web apps, and desktop icons, with small-size and dark-background adaptations.
- Explore editable component, typography, and paint comparisons in the demo, with the original examples preserved on a reference page.
- Use compact desktop Home search actions with consistent responsive layout and control sizing.
- Keep pixel-grid rounding invisible while showing alignment guides only for real geometry, objects, and canvas/layout guides.
- Embed images when copying selections into Figma, and preserve geometry, text sizing, component links, variables, modes, and shared styles when pasting within OpenPencil.
- Choose the app theme and whether animations follow the system or stay off under Appearance in General Settings, with live updates and persistent preferences.
- Simplify property panels with fill and stroke style pickers in section headers, concise effect style rows, and collapsed equal corner fields when all four share a variable. Preserve applied and missing styles and remove the redundant Dimensions heading for text layers.
- Open variable pickers below their trigger when space permits, flipping above near the viewport edge.
- Keep AI chat preferences with the model overview and edit models in a fixed-size Settings pane with explicit Save and Cancel actions.
- Match page-list density to the layer tree and add subtle, reduced-motion-aware dialog transitions.
- Fade in streaming Markdown list items and code lines without animating completed responses.
- Vertically center shaped section titles and allow renaming a section by double-clicking its canvas label.
- Load supported online fonts before revealing imported pages, preserve substituted text during editing, and shape canvas labels with Inter typography and shared Arabic/CJK font fallback.
- Complete translated app, accessibility, font, color, file, clipboard, collaboration, chat, vectorization, storage, recovery, component-library, and connection feedback across supported locales, and synchronize document language with the selected locale.
- Separate local MCP server controls, browser WebMCP access, and remote connections in Settings, with inline searchable tool permissions.
- Show translated field errors, hints, and consistent contextual alerts in Settings forms, focus the first invalid field on submission, and explain missing requirements instead of silently disabling Save or Test.
- Pan horizontally with Shift+wheel while preserving native horizontal trackpad movement.

### Fixed

- Render four-point diamond gradients, preserve text layout across fill types, and keep image colors accurate on sRGB displays.
- Keep newly created and edited objects visible during zoom instead of replaying outdated scene content.
- Keep property fields and paint previews live during editing, rotated selection labels readable and aligned, and object edges stable when previews settle.
- Show compact bordered section labels with inset nested titles and clearer hover feedback.
- Keep Undo and Redo commands available as edit history changes, without requiring another scene edit.
- Avoid recursive desktop HTTP proxy requests when font downloads intercept Tauri IPC traffic.
- Keep FIT image fills proportional, centered, and fully visible without stretching or cropped edges.
- Preserve edited instance text, including cleared labels, when saving and reopening `.fig` files.
- Honor `.pen` frame layout defaults and sizing and padding shorthands so imported auto-layout frames keep their computed dimensions and child positions (#564).
- Avoid macOS Keychain prompts during credential status checks and pause repeated credential access after failures until explicitly retried from Settings.
- Honor explicit Design JSX instance dimensions and preserve authored overrides through component synchronization.
- Route browser Command/Ctrl plus and minus shortcuts to canvas zoom instead of page zoom.
- Resolve `$name` references in imported `.pen` fills, stroke fills, font families, dimensions, and spacing without requiring a `--` prefix (#563).
- Resolve bound fields in each layer’s mode, keep variable edits scoped and undoable, and make broken bindings visible and recoverable.
- Display letter spacing in pixels and support explicit automatic line height.
- Prevent the stock photo tool from replacing text, lines, structural layers, or containers with content while supporting closed shape geometry.
- Preserve imported Figma text alignment metadata, explicit normal blend modes on text and vectors, and implicit fixed text sizing in auto-layout frames across save and reload.
- Render imported Figma strokes with odd-length dash patterns correctly.
- Stop showing a misleading desktop-only warning when web font loading or catalog lookup fails.
- Resolve fallback fonts reliably for cached characters, mixed-language text, and text-case transformations.
- Preserve imported Figma divider-line geometry during auto-layout recomputation, preventing half-pixel shifts on save and reload.
- Resolve package imports under Node and Bun from ordinary tarballs while preserving Bun source-first workspace execution (#663).
- Use the user's home directory as the default MCP file root on Windows, avoiding the caller's unreliable working directory.
- Open legacy raw `.fig` files that store the Kiwi document and thumbnail without a ZIP wrapper (#582).
- Preserve a frame's auto-layout HUG sizing, variable bindings, and variable modes when converting it into a component through the Figma API or automation (#595).
- Run `openpencil import` on Node so npm-installed CLI users no longer encounter `Bun is not defined` (#575).
- Generate recent-file previews from the conventional `Cover` page without modifying the source file.
- Resolve Vue SDK semantic test selectors correctly in non-browser runtimes (#397).
- Commit vector vertex and Bézier-handle edits when the pointer is released and keep transformed vector-edit overlays aligned (#586).
- Preserve app-created component properties and instance-swap targets across `.fig` save and reload cycles (#548).
- Reconnect desktop automation to an already-running MCP server through its discovery file (#546).
- Keep text-editing carets, hit testing, and selection highlights aligned with vertically centered or bottom-aligned text (#539).
- Match AI chat code-block colors and backgrounds to the active theme, and let desktop users select and copy chat text without replacing it with canvas layers (#537, #538).
- Restore visible above, below, and child drop feedback while dragging layers in the Layers panel.
- Place editor-created instances beside nested source components in world space, including transformed parents.
- Prevent malformed collaboration updates from corrupting synchronized nodes or derived text rendering.
- Transfer native `.fig` exports over binary Tauri IPC, preventing large desktop saves from being truncated or exhausting WebView memory (#484).
- Decode zstd-compressed FIG containers and reject invalid compressed payloads (#397).
- Compose caller CSS with Tailwind defaults when importing DOM/CSS documents (#397).
- Preserve desktop HTTP timeout, abort, and empty-response semantics (#397).
- Report whether missing Figma clipboard images were actually fetched (#397).
- Report exhausted provider credit, request failures, and output-token limits through localized chat toasts and copied diagnostics (#451, #454).
- Prevent Windows desktop crashes when loading large system fonts for non-Latin text.
- Preserve open vector segments when the same vector network also contains filled regions (#450).
- Match Figma Plugin API behavior for `rescale()`, page `backgrounds`, and nullable visual `absoluteRenderBounds` (#442).
- Keep imported and pasted Figma instances linked to their remapped source components so later component edits update existing instances (#385).
- Restore native copy, cut, and paste shortcuts in desktop text inputs while preserving design clipboard handling on the canvas.
- Preserve committed desktop text input when the WebView supplies text through the input event before updating the hidden text field (#607).
- Preserve selected layers when browser clipboard serialization fails during cut operations, and fall back to the session clipboard when system clipboard access is unavailable (#568).
- Treat MCP tool results with an omitted `isError` field as successful while preserving explicit MCP errors (#583).
- Preserve effective nested instance text overrides when importing complex Figma component hierarchies (#102).
- Preserve SVG clip paths, including clip shapes referenced through `<use>`, when importing editable vectors.
- Preserve circles, ellipses, rectangles, lines, polylines, and polygons supplied as JSX children of inline SVG elements (#452).
- Stop local MCP servers after the app disconnects instead of leaving orphaned background processes (#494).
- Prevent unbounded instance duplication when editing Figma-imported or pasted components with serialized or renamed children, keep extra instance children in their intended order, and avoid pasted instances re-linking pre-existing instances during clipboard import.

### Performance

- Reduce pauses after repeated frame creation without leaving hidden property edits or popups active.
- Reduce repeated text shaping and scene invalidation while moving and resizing objects, and reuse fitting canvas labels during zoom.
- Reduce unnecessary layout work after automation and Figma API edits by updating only affected layers and containers.
- Keep rapid trackpad zoom reversals and effect-heavy document navigation responsive by cancelling obsolete reconstruction and reusing safe raster snapshots.
- Show the FIG page list from a lightweight Kiwi scan before materializing the full document.
- Avoid redundant collaboration writes when synchronized node fields have not changed.
- Release completed streaming-response state to reduce retained chat memory (#544).
- Open large documents faster by reducing repeated position calculations when finding layers under the pointer (#527).
- Avoid redundant autosaves while a `.fig` export is in progress, while ensuring newer edits are saved afterward (#528).
- Defer JSX generation and syntax highlighting until the Code panel is active, keeping large canvas selections responsive (#500).
- Paste large, flat Figma selections faster by avoiding repeated scans of clipboard layers (#500).
- Reduce peak memory during `.fig` export by sharing immutable binary resources with the isolated export graph.

### Security

- Protect new real-time collaboration sessions with stronger invitation credentials.

## 0.14.0 — 2026-08-10

### Breaking changes

- **Core SDK:** Import scene graph types, geometry, coordinate, matrix, snapping, undo, and path helpers from `@open-pencil/scene-graph`; import `.pen` parsing from `@open-pencil/pen`; import synchronous Kiwi decompression from `@open-pencil/kiwi` instead of the `@open-pencil/core` compatibility barrel; use uppercase acronym casing in exported identifiers, including `JSONObject`, `JSONArray`, `JSONValue`, `RPCCommand`, and `executeRPCCommand`; and use the renamed tool exports `importSVG`, `exportSVG`, `exportPDF`, `getJSX`, `diffJSX`, and `setPexelsAPIKey`.
- **Vue SDK:** Replace the removed color-picker model helpers with `useColorModel()`; replace the deprecated `FillPickerRoot` and `useFillPicker()` APIs with `FillRoot`, `FillSwatch`, `useFill()`, and a consumer-owned popover; rename `FontPickerUi` to `FontPickerUI`; and remove the exported `testId` prop helper types in favor of semantic component anatomy.
- **CLI and MCP SDKs:** Use uppercase acronym casing in exported identifiers, including `AppTargetCLIArgs`, `appTargetRPCArgs`, `loadRPCData`, `prepareDocumentForRPC`, `RPCSender`, `createBrowserRPCBridge`, `createMCPSessionManager`, and `createStdioRPCBridge`.

### Added

- Export selections, pages, and documents as editable PowerPoint (`.pptx`) files from the File menu, CLI, and SDK. Text, rectangles, ellipses, and lines remain editable; visually complex layers are embedded as images.
- Import HTML, CSS, Tailwind, and JSX as editable documents from the app, CLI, and SDK, and export standalone browser-ready HTML with compiled CSS and optional external assets.
- Drag image files into the desktop app and paste Figma layers with their remote image fills.
- Import dropped SVG files as editable vector layers, preserving compatible multi-color fills and transparent paints. (#386, #392, #394, #446).
- Convert image layers into editable vectors with Recraft or fal.ai from the canvas context menu. (#322).
- Browse document components as thumbnails or a list in the Assets panel, group them by page, and drag instances directly onto the canvas. (#424).
- Create centered frames from Figma-style device and asset presets, or resize selected frames to a preset while preserving their names. (#418).
- Manage pages by renaming, deleting, and dragging to reorder them in the Pages panel.
- Create text by dragging a fixed-size text box or clicking for auto-width text.
- Create and edit layout grids for frames and components, including columns, rows, counts, gutters, margins, visibility, and grid size.
- Inspect and edit constraints, stroke caps and joins, corner smoothing, shared styles, component properties, blend modes, masks, advanced typography, text resizing, and per-node export settings from the Design panel.
- Edit solid fill colors by entering hex values directly in the Design panel.
- Use Figma-style number-key opacity shortcuts: `1`–`9` set 10%–90%, `0` sets 100%, and two-digit sequences set exact values.
- Access more common design actions from the browser and desktop menus, including visibility, locking, masks, flipping, components, z-order, distribution, selection, rulers, multiplayer cursors, and Settings.
- Find overlapping layers and overflowing children from the CLI, AI tools, and MCP.
- Target a specific open document and page from live CLI and MCP automation, including sessions with multiple documents.
- Connect local MCP clients through automatically discovered private Unix sockets on macOS and Linux, with localhost TCP fallback. (#338).
- Test OpenAI-compatible provider connections from AI settings with clearer setup errors.
- Configure separate Design, Review, Fast, and Vision models, providers, endpoints, and credentials from AI settings.
- Manage AI, agent, media, and storage credentials from unified Settings, using the system credential store on desktop and encrypted browser storage by default, with a session-only browser option.
- Connect an S3-compatible storage workspace with local-first saves, background synchronization, embedded `.fig` previews loaded without downloading full documents, and automatic refresh while the workspace is active.
- Add Japanese localization and improve menu translations across the existing supported languages. (#367).
- Author richer Design JSX with components, instances, variables, gradients, structured fills, shadows, blur effects, masks, and inline SVG vectors.
- Build custom property panels and document workspaces with new Vue SDK number fields, bindable values, property sections, responsive grids, segmented controls, property lists, color models, fill controls, gradient primitives, and the headless `useDocumentWorkspace()` composable.
- Use `useColorModel()` in the Vue SDK for extensible color formats and shared RGB, HSL, HSB, and OkHCL channel behavior.
- Add dedicated SceneGraph, Pen, Kiwi, Fig, and DOM/CSS packages with documented public entry points for building on OpenPencil.

### Changed

- Simplify AI model setup with clearly separated model, connection, and advanced settings, automatic compatibility and output-limit defaults for recognized models, and an explicit custom-model option.
- Redesign the editor chrome and Design panel with denser, better-aligned controls, clearer selection and section states, improved menus and overlays, consistent light/dark theming, and better keyboard and screen-reader support.
- Choose Freeform, vertical, horizontal, or grid flow directly from the contextual Layout section, with sizing controls grouped alongside it.
- Choose Auto width, Auto height, or Fixed size directly from the Layout section for text layers.
- Scale the Layers panel to documents with thousands of nodes through virtualized rows, faster incremental updates, stable expansion, range selection, and scroll-to-selection.
- Open and save large `.fig` documents substantially faster while preserving original metadata and user edits, and switch between large pages with fewer Layers panel stalls. (#420).
- Resolve fonts before text appears, with language-aware CJK and Arabic fallbacks, character-specific remote subsets, and more reliable rendering as fonts load.
- Use MiniMax M3 as the default model for MiniMax AI connections. (#431).
- Center empty and setup states consistently across panels, dialogs, and workspaces.

### Fixed

- Keep desktop startup clean when optional MCP automation is unavailable, retain startup diagnostics for MCP-dependent features, and load JSX syntax highlighting without browser globals.

- Preserve Figma’s imported glyph outlines through layout and appearance updates so text keeps its intended weight and shape.
- Keep swapped image avatars and thin stepper dividers at their effective imported size and position.
- Scale proportion-constrained `.fig` instance geometry through fixed wrapper layers so imported logos and icons retain their intended size.
- Match Figma auto-layout spacing, padding, min/max constraints, scalar variable bindings, CanvasKit-shaped generated text, imported text bounds, and nested instance geometry more closely.
- Match Figma Plugin API vector path and network editing, including bounds, transforms, winding rules, region fills, validation, and handle mirroring. (#444).
- Let AI and MCP tools create arbitrary vectors from SVG path data, validating input without leaving blank layers behind. (#440).
- Improve AI design accuracy by exposing every supported shape, including visible stroke colors and weights in visual descriptions, and accepting supported inline SVG attributes without false warnings. (#445, #447, #448).
- Restore Anthropic AI connections in the web app instead of failing with a browser endpoint error. (#438).
- Reconnect live CLI and automation sessions automatically after an unexpected bridge disconnection.
- Keep MCP file access inside its configured root when paths contain symlinks, and strengthen local authentication token checks. (#338).
- Start globally installed ACP agents correctly on Windows instead of reporting them as unavailable. (#361).
- Resume pending cloud saves after restarting the app or temporarily losing credentials, without reviving deleted documents or overwriting newer local changes.
- Handle S3 object listings, pagination, and escaped names more reliably, and explain required CORS setup without modifying bucket rules.
- Show HTML, CSS, Tailwind, and JSX import errors instead of failing silently.
- Preserve inline SVG attributes, nested transforms, and explicit icon dimensions when rendering Design JSX artwork.
- Save auto-layout frames that stretch their children to `.fig` without failing. (#427).
- Preserve nested instance text, visibility, paint, geometry, clipping, variable modes, and component swaps in `.fig` files.
- Improve `.fig` import and rendering fidelity for groups, booleans, instances, rotated vectors, complex text fills, auto-sized text, layout grids, page guides, patterns, noise effects, masks, and canvas backgrounds.
- Preserve pages, components, prototype and library metadata, export settings, unsupported effects, and other unrelated Figma data when editing and resaving `.fig` files.
- Prevent duplicate generated IDs from corrupting `.fig` round trips.
- Preserve the whole document when exporting FIG unless a page is explicitly requested, populate unopened pages for file-mode CLI inspection, and expose vector paths and variable modes to Plugin API scripts.
- Report corrupted compressed `.fig` data as an error instead of opening it as valid content.
- Match Figma auto-layout reflow after deleting children, hiding optional instance slots, or syncing component changes.
- Make group and boolean-operation children scale with their parent during resize.
- Edit vectors in opened documents at the correct position, with live fill updates and working undo and redo. (#390).
- Keep duplicated layers independent instead of sharing mutable fills, strokes, bindings, overrides, or vector data, and remove stale bindings when paints are deleted.
- Keep desktop text visible across scene and overlay canvases, refresh it after local fonts load, and preserve rendering when an italic face is unavailable. (#395).
- Vertically center text correctly when an explicit line height adds space above and below its glyphs. (#422).
- Preserve Hangul IME composition while editing text.
- Restore desktop copy, cut, and paste when browser clipboard events are unavailable.
- Finish pasting Figma layers promptly even when remote images are slow or unavailable, and hydrate their image fills when downloads complete.
- Reuse the existing tab when reopening a file through its desktop path or browser file handle, avoiding duplicate watchers and conflicting saves. (#297).
- Share public app links from the desktop collaboration panel and send the current document to newly joined collaborators.
- Show only the most specific tooltip when property controls contain nested actions.
- Match regional browser languages to supported locales without selecting a lower-priority language. (#417).
- Improve Simplified Chinese translations and correct localized menu terminology.
- Resolve published package types correctly for TypeScript consumers and keep file-backed CLI commands working under Node.

### Security

- Update the collaboration WebSocket dependency to address a protocol-length advisory.

## 0.13.2 — 2026-05-30

### Changed

- Update the Homebrew install command to use the published `openpencil` cask.

### Fixed

- Fix the published MCP package so global installs include the `openpencil-mcp` and `openpencil-mcp-http` launchers required by desktop app integrations.

## 0.13.1 — 2026-05-29

### Fixed

- Fix the npm package contents for the CLI so Bun installs include the built `openpencil` binary and runtime bundle.

## 0.13.0 — 2026-05-29

### Fixed

- Fix the published CLI package so Bun global installs run the built `openpencil` binary instead of raw TypeScript sources.

- Greatly improve importing Figma `.fig` files with complex component systems: badges, avatars, icons, links, input fields, lists, date pickers, nested instances, component swaps, and variant properties now open much closer to their original Figma appearance.
- Fix missing or white content in imported `.fig` files caused by unresolved Figma variable bindings, including image/avatar badges, icon colors, text colors, and variable-backed component overrides.
- Preserve more Figma document details when opening and saving `.fig` files, including internal component pages, component ordering, page metadata, canvas backgrounds, text layout, glyph rendering, vector geometry, effects, shadows, and instance overrides.
- Keep user edits after opening an imported `.fig` file: changing size, position, fills, text, or layout now wins over preserved Figma round-trip data when the document is saved again.
- Fix `.fig` exports so files reopened in Figma or OpenPencil keep their pages, components, instances, text wrapping, icons, avatars, and preview thumbnail intact.
- Fix live canvas updates during move/resize/edit previews so visible scene changes repaint immediately.
- Fix accidental duplicate creation when Alt-clicking without dragging.
- Fix MCP startup in the browser.
- Fix CanvasKit loading outside the browser when project paths contain spaces.
- Render imported Figma layer and fill blend modes such as multiply, screen, overlay, difference, hue, saturation, color, and luminosity.
- Render common imported Figma mask stacks so visible layers above alpha, vector, or luminance masks are clipped by the mask shape, including consecutive mask layers.
- Render Figma-style smoothed rectangle corners, including independent corner radii, and effect blend modes from imported Figma files.
- Improve imported tiled image fills by applying Figma image transforms when repeating image patterns.
- Keep imported Figma boolean operations editable as boolean-operation nodes instead of flattening them to vectors.
- Apply imported variable font axes from Figma `fontVariations` when rendering text.
- Render more imported Figma visual metadata, including text decoration styles, leading trim, pattern fills, layout grids, page guides, and deterministic fallbacks for raw noise effects.

### Performance

- Open large `.fig` files faster by deferring work for pages you have not viewed yet while still preparing all needed content before export.
- Improve canvas responsiveness during zooming, panning, dragging, and editing by reusing cached scene backing where safe.
- Speed up `.fig` export for documents with many preserved Figma paint and variable payloads.

## 0.12.2 — 2026-05-19

### Added

- Allow OpenRouter users to enter any model ID from provider settings with cached autocomplete suggestions for tool-capable models, while keeping the curated dropdown as the default when no custom model is set.

### Changed

- Use localized app tooltips instead of native browser titles across editor controls, panels, and menus.
- Update Claude Code MCP setup documentation and the docs landing screenshot.
- Ignore non-source Markdown files in the app dev watcher so documentation edits do not reload the running editor.

### Fixed

- Route Claude Code stdio MCP requests through the live OpenPencil app connection, including immediate disconnected errors when no document is connected.
- Keep MCP disconnected guidance focused on starting OpenPencil and opening a document.
- Improve agent-rendered JSX compatibility with Figma-style text, alignment, and rotation aliases; strip HTML comments; and report unsupported props from render tools.
- Load exact text font styles after MCP and AI tool mutations so newly created bold/weighted text renders immediately.
- Include text style fields in MCP `get_node` output so agents can verify generated text accurately.
- Keep provider settings tooltip/popover composition working in WebKit.

## 0.12.1 — 2026-05-19

### Fixed

- Fix `.fig` round-trips for OpenPencil component sets and variable bindings, and recompute imported layouts after opening documents.
- Report desktop/MCP package version mismatches explicitly and include package-manager-aware install guidance from the MCP server.
- Support scoped MCP `save_file({ path })` workflows while keeping file saving in the desktop app.
- Use native Tauri path handling for save parent directories so Unicode and Windows paths are handled correctly.
- Fix the web font picker so Google Fonts remain available in Safari, local font access is requested on first open when supported, font sources are labeled, and Google font previews load lazily for visible rows.
- Fix background blur rendering so it blurs the backdrop behind a layer instead of applying a no-op content filter, and keep effect parameter controls visible in the properties panel.

## 0.12.0 — 2026-05-18

### Added

- Assets panel — browse, search, and insert document components directly from the left sidebar.
- Component variants — switch instance variants from the right inspector; default variant respects property definitions.
- Figma library metadata — component keys, source libraries, version IDs, descriptions, and docs links are preserved on import/export.
- Desktop file associations — double-click `.fig` or `.pen` files in Finder/Explorer to open them in OpenPencil.
- Auto-update — startup update checks and a Check for Updates menu item on desktop.
- Light theme with theme-aware canvas rulers.
- PDF export — available in the export panel, CLI (`--format pdf`), and MCP.
- SVG import tool for automation workflows.
- DeepSeek AI provider.
- Variable modes — create, rename, duplicate, delete, and set defaults per collection.
- Variable binding controls for fills, strokes, sizing, min/max, and typography fields.
- Auto-layout inspector controls for min/max dimensions, auto gap, wrap gap, and two-axis padding.
- Stroke dash/gap controls.
- Font settings — local font access, fallback predownloads, and downloaded font cache management.
- Editor commands for frame selection, paste to replace, Boolean operations, flatten, outline text, and outline stroke.
- Boolean operations panel control and canvas context-menu entries for flattening and outlining supported selections.

### Changed

- Smaller domain modules across core, app, Vue SDK, CLI, MCP, docs, and desktop with enforced package boundaries.
- Separate scene and overlay canvas layers — rulers, labels, and selections no longer cause scene redraws.
- Shared menu schema between browser and native Tauri menus.
- Editor command metadata now drives shortcut display across browser menus, native menus, tooltips, and context menus.
- Text-to-vector conversion now uses shared loaded-font outline geometry across Boolean, flatten, and outline commands.

### Fixed

- Fix `.fig` export of component variant properties and text stretch alignment so designs round-trip correctly through Figma.
- Fix CJK and Arabic text rendering — fallback fonts now load before the first paint instead of showing blank text.
- Fix large `.fig` files freezing on open — parsing runs in a worker, and the viewport fits to content after loading.
- Improve Figma import fidelity — variable aliases, nested instances, avatar swaps, badge internals, and input text alignment are preserved.
- Improve Figma export fidelity — flipped vectors, stroke geometry, visual overflow, and stroked-shape drop shadows are preserved.
- Fix variant switching so instances update their contents, not just the component reference.
- Fix text editing inside components and instances on double-click.
- Fix paste into selected containers and entered frames.
- Fix clipboard parsing to safely ignore invalid data.
- Fix undo/redo for duplicate, state restore, and modifier-key release.
- Prevent browser from intercepting app-level undo/redo shortcuts.
- Fix font loading and bundled font resolution.
- Show the startup loader until fonts load and the first render completes.
- Improve light theme polish and canvas ruler colors.
- Normalize browser zoom speed.
- Fix variable picker popovers and color binding swatches.
- Fix dashed strokes on vector nodes and gradient fills on text.
- Fix inner shadow rendering on text nodes.
- Fix imported Figma-derived underlined text rendering.
- Fix exponential `.fig` file growth on repeated save/load cycles.
- Fix opening large `.fig` files so every page populates component instances, preventing missing nested content when switching pages.
- Fix canvas size badges scaling with zoom.
- Fix layout inspector dropdown anchoring and spacing/padding icon clarity.
- Fix section drawing and color input forwarding in the property panel.
- Fix asset insertion coordinates inside entered containers.
- Fix MCP stdio handshake and eval return values.
- Fix `@open-pencil/vue` npm imports referencing an unexported core subpath.
- Fix Figma clipboard text compatibility — pasted OpenPencil text keeps editable fixed bounds, line wrapping, baselines, glyph offsets, and Figma edit-mode layout.
- Fix local font matching so requested upright and weighted faces do not fall back to italic or regular faces.
- Fix CanvasKit paragraph rendering to preserve requested text weights and slants.
- Fix nested text editing interactions — drill double-click enters nested text edit mode, and clicking another text node switches edit targets while editing.
- Fix auto-height text edit commits so text bounds and undo state stay in sync.
- Fix Boolean, flatten, and outline operations to reject unsupported image/complex-script sources safely instead of silently dropping geometry.
- Fix outline stroke enablement for stroked descendants inside groups and containers.

### Performance

- Event-driven canvas rendering — scene and overlay layers only repaint when their inputs change, replacing continuous polling.
- Shared RAF scheduler coalesces scene and overlay frames into a single animation frame per editor.
- Font-family fallback arrays and downloaded remote fonts are cached to avoid repeated work.
- WebGL draw-call instrumentation only runs while the profiler is active.
- Instance override resolution is cached and `.fig` pages load lazily for large files.
- Live drag/resize uses repaint-only previews to skip layout during interaction.

## 0.11.8 — 2026-04-23

### Fixed

- Fix MCP server not spawning on Windows — use `cmd /c` to resolve `.cmd` wrappers from npm global installs.
- Fix MCP server and automation WebSocket not connecting on Windows/Linux — inline `__TAURI_INTERNALS__` check at call time instead of using stale module-level `IS_TAURI` constant.
- Fix shell PATH not inherited by GUI app on macOS/Linux — add `fix-path-env-rs` to read shell config.

## 0.11.7 — 2026-04-22

### Added

- Add stdio transport for MCP server — `openpencil-mcp` now works as a proper stdio MCP server for Claude Code, Cursor, etc. HTTP server available as `openpencil-mcp-http`.
- Default canvas background to dark when system prefers dark color scheme.
- Add `list_available_fonts` MCP tool for font discovery.
- Copy node ID / XPath from context menu; CLI selection command.
- Arrow key nudge for selected nodes (1px, Shift+arrow for 10px).
- JSX renderer: `position="absolute"`, `top`, `left` props for absolute children inside auto-layout containers.
- MCP server sends `notifications/tools/list_changed` when the desktop app connects or disconnects.
- Headless text measurement via opentype.js per-glyph advance widths — no CanvasKit needed.
- Add `open_file` and `new_document` MCP tools with `OPENPENCIL_MCP_ROOT` path scoping.
- Optional `path` param on `export_image`, `export_svg`, `get_jsx` — write output to disk instead of returning base64/string.
- Multi-root JSX support — multiple top-level elements auto-wrapped in a fragment.
- `Component` and `Instance` tag aliases in JSX renderer.
- JSX prop reference doc — copy to clipboard via book icon in Code panel.
- Prompts (`CODEGEN_PROMPT`, `JSX_REFERENCE`) moved from embedded strings to markdown files.

### Fixed

- Fix Backspace not deleting selected nodes after clicking on canvas — canvas now receives focus on click so keyboard shortcuts aren't blocked by stale input focus.
- Support Cmd/Ctrl+click for additive multi-select in layers panel (previously only Shift+click worked).
- Fix macOS Tauri build — move `NSAllowsLocalNetworking` ATS config from invalid `tauri.conf.json` property to a proper `Info.plist` file.
- Fix tab order and keyboard handling in inspector panel.
- Fix design token variables not resolved before passing to yoga-layout.
- Suppress keyboard shortcuts while editing property panel inputs.
- Fix tooltip competing with popover trigger on Windows.
- Fix hit area for nodes with rotated parents.
- Error toasts auto-dismiss, deduplicate, and cap stack at 5.
- Bump yoga-layout to 3.3.0-grid.3 with `Node.free()` support.
- Bump PWA precache limit for canvaskit-webgpu.
- Fix color picker dragging flooding the undo stack — fill/stroke/effect color and opacity drags now collapse into a single undo entry per interaction via debounced batching in `PropertyListRoot`.
- Fix .fig import crash on alias variables without a GUID.
- Fix `save_file` crash on vectors with missing tangent control points — default to straight segments.
- Validate `create_vector` path JSON upfront with clear error messages for malformed input.
- Fix MCP/AI tools rejecting string-encoded numeric arguments from MCP clients (`"42"` → `42`).
- Fix "Create Instance" context menu item always grayed out — inverted disabled flag.
- Show "Create Instance" instead of "Create Component" in context menu when a component is selected.
- Fix headless layout: use stored .fig dimensions instead of rough text size estimates (26K → 11K mismatches on material3.fig).
- Fix `--help` output with huge vertical gaps between commands — remove inline examples from query description.
- Fix `openpencil-mcp` npm package missing `dist/stdio.js` — explicitly list entry points in tsconfig.
- Show toast when MCP server fails to start instead of silently swallowing the error.
- Fix provider settings popover not appearing — tooltip wrapper broke floating-ui positioning.
- Fix `set_font_range` producing invalid style runs that crash `.fig` export — use `applyStyleToRange`, apply color and fontWeight from style name.
- Fix MCP "app not connected" error — message now instructs the agent to stop and inform the user.
- Fix external links in AI panel blocked by Tauri ACL — use opener plugin instead of shell.

## 0.11.6 — 2026-04-08

### Fixed

- Switch `@open-pencil/core` build from `tsgo` + `fix-esm-import-path` to `tsdown` — fixes bare directory imports that broke Node.js and Bun consumers.

## 0.11.5 — 2026-04-08

### Fixed

- Fix published npm packages resolving to TypeScript source instead of compiled JavaScript — `publishConfig.exports` overrides are now applied during CI publish.
- Fix Windows CI build failures caused by backslash file paths in custom lint rules.

## 0.11.4 — 2026-04-08

### Fixed

- Fix `@open-pencil/core` published package containing stale import paths from before the domain module restructuring — CLI and MCP installs from npm now resolve correctly.
- Add `save_file` MCP tool for saving the current document to disk.
- Clipboard text export now writes richer v4 `derivedTextData` payloads with glyph outlines for better paste fidelity.

## 0.11.3 — 2026-04-08

### Fixed

- Show actionable install errors in the chat panel when a required local AI CLI is missing.
- Fix inline layer rename so clearing the name restores the default name, and Backspace/Delete inside rename inputs no longer delete the layer.
- Fix rotated frame hit testing, hover highlights, and selection overlays so interactive areas and overlay labels stay aligned during rotation.
- Fix text edit undo so it restores both the original text and `styleRuns`.
- Pressing Enter with a selected text node now starts text editing and selects all text.
- Fix `ScrubInput` Enter handling so committing a value no longer triggers a second blur-based commit that overwrites it.
- Show the auto-layout panel for `COMPONENT`, `COMPONENT_SET`, and `INSTANCE` nodes.
- Fix missing layout direction icons in the auto-layout controls.
- Fix nested text selection inside gradient cards.
- Unify the size control into a single inline sizing input/dropdown with shorter localized labels to prevent overflow.

## 0.11.2 — 2026-03-30

### Fixed

- Stabilize npm publishing with isolated temp publish directories instead of mutating tracked package manifests in CI.
- Strip build-time scripts and dev dependencies from generated publish manifests so tarballs pack from verified artifacts only.
- Fix `@open-pencil/mcp` release packaging so the published npm tarball includes its built `dist/` CLI and server entrypoints deterministically.
- Fix `@open-pencil/core` release build configuration so CI publish jobs include Node and Bun ambient types when compiling package artifacts.

## 0.11.1 — 2026-03-30

### Fixed

- Fix npm publishing pipeline to publish packed tarballs instead of raw package folders.
- Attempt to fix `@open-pencil/mcp` npm package contents so the published CLI includes its built `dist/` entrypoints.
- Fix `@open-pencil/vue` npm package metadata and build output so the published package resolves from `dist/` while local workspace development keeps using source aliases.

## 0.11.0 — 2026-03-30

### Added

- Lock and visibility toggle buttons in layers panel (hover to reveal, always shown when active).
- Figma-style selection scope — double-click to enter groups/frames/components, Escape to exit.
- Nested container navigation — each double-click goes one level deeper.
- Dashed border around entered container for visual feedback.
- Layer panel click syncs canvas scope automatically.
- Vue SDK internationalization primitives — `useI18n()`, locale detection, persisted locale selection, lazy-loaded locale JSON files, and exported locale metadata for custom editor shells.
- Vue SDK docs and public API audit — documented advanced exports (`useOkHCL()`, variables helpers, viewport and locale APIs), aligned docs with the actual `provideEditor()` injection model, and expanded release-ready SDK guidance.
- npm release pipeline now publishes `@open-pencil/core`, `@open-pencil/cli`, `@open-pencil/mcp`, and `@open-pencil/vue` together on version tags.
- App language picker in the menu bar — switch UI locale without reloading.
- Added a vector curve editor and improved drawing experience with the pen tool.
- Resume pen drawing from existing open path endpoints — click an endpoint to continue the curve.
- Close open paths by dragging one endpoint to the other.
- Align selected anchor points relative to each other in vector edit mode — the standard alignment buttons in the position panel now operate on selected vertices when 2 or more are selected.
- Unified core IO format registry — `.fig` is now modeled as the native document format alongside shared export adapters for PNG, JPG, WEBP, SVG, and JSX.
- Export selection or current page as `.fig` from the app export UI and app menu.
- New CLI commands: `open-pencil convert` for document conversion, `open-pencil formats` to inspect readable/writable/exportable formats, and `open-pencil lint` for design consistency, structure, and accessibility checks.
- CLI export now supports `.fig` output and routes PNG/JPG/WEBP/SVG/JSX/`.fig` through the shared IO layer.
- `Open…` now supports `.pen` Pencil documents through the shared document reader pipeline while keeping `.fig` as the native save format.
- Display‑P3 document color space pipeline — documents now default to Display‑P3, `.fig` import/export preserves document color profiles, the live canvas requests P3 surfaces with sRGB fallback, and raster/SVG export paths accept explicit color-space targets.
- Color picker overhaul — unified `RGB` / `HSL` / `HSB` / `OkHCL` field formats, slider-space-aware track/thumb previews, and better neutral-color editing behavior for fills, strokes, gradient stops, and component fills.
- OkHCL metadata now round-trips through `.fig` plugin data and integrates directly into the main fill/stroke color workflow with preview gamut diagnostics.
- Vue SDK now exposes reusable color-picker model helpers and solid fill/stroke commit helpers for custom editor shells.
- Update built-in Z.ai and MiniMax model lists — Z.ai now uses the Anthropic-compatible endpoint for GLM coding models, adds GLM-5.1, and MiniMax adds M2.7 / M2.7-highspeed.
- Arabic and RTL support across text rendering, editing, layout, export, and AI tooling — text nodes support `Auto`/`LTR`/`RTL`, auto-layout frames support `Auto`/`LTR`/`RTL` flow, and JSX/AI prompts/tools can now generate and edit both explicitly.

### Fixed

- Fix shortcuts, now work on non-English keyboard layouts.
- Fix imported `.fig` file open and page-switch regressions — loaded documents now keep graph/store state in sync, remap imported canvas/page children correctly, and recompute imported auto-layout descendants when switching pages.
- Fix first canvas render happening before fonts load — wait for fonts before the initial draw to avoid Safari and text measurement glitches.
- Preserve `fig-kiwi` version on `.fig` roundtrip — imports keep the original header version instead of rewriting everything to a hardcoded value; new files default to version 101.
- Normalize auto-layout text export for Figma — text children inside auto-layout frames now serialize with `NONE` auto-resize to match Figma behavior and avoid overflow on reimport.
- Fix keyboard editing regressions after the refactor — canvas shortcuts no longer fire while editing text, and Delete/Backspace no longer delete nodes during text entry.
- Fix MCP page switching persistence — `switch_page` now survives across tool calls in the same session.
- Improve CJK font fallback coverage — load multiple Google Fonts for broader Han/Japanese/Korean text support.
- Normalize more visible UI strings for localized app chrome — menus, panels, variables dialog, code panel, chat setup, and editor controls now respect the selected locale instead of falling back to English in common flows.
- Fix imported text rendering in browser and headless export — preserve stored bounds until fonts are ready, restore missing font-loaded guards, use natural width for `WIDTH_AND_HEIGHT` text, and clip text to node bounds.
- Fix browser/headless rendering mismatch for imported toolbar/instance content by correcting runtime imported layout recomputation instead of diverging browser rendering behavior.
- Fix `set_layout` tool not defaulting to HUG sizing when enabling auto-layout — frames now shrink/grow to fit children instead of keeping fixed dimensions.
- Normalize font family names on `.fig` export — strip optical size suffixes (e.g. "DM Sans 9pt" → "DM Sans") so Figma recognizes the font.
- TEXT nodes now default to a solid black fill — previously exported with no fill, making text invisible when opened in Figma.
- Fix save crash when COLOR variable is missing alpha channel.
- Fix console error spam on deployed web app from automation WebSocket reconnect loop.
- Fix headless CLI font fallback — bundled Inter font now ships with `@open-pencil/core` and loads without a web server.
- Locked nodes now block move, resize, rotate, and delete on canvas.
- Locked containers block double-click enter.
- Marquee selection skips locked and hidden nodes.
- COMPONENT/INSTANCE containers are now enterable via double-click.
- Replaced the alignment and reflection icons with the correct ones.

## 0.10.0 — 2026-03-15

### Added

- ACP agent support — use Claude Code, Codex, or Gemini CLI as AI assistants in the desktop chat panel.
- Permission confirmation dialog — ACP agents request user approval for file/shell operations, MCP design tools auto-approved.
- Unified MCP server — single HTTP + WebSocket proxy replaces Vite SSR bridge.
- Stock photo integration — `stock_photo` tool fetches images from Pexels or Unsplash and applies to design nodes. Provider adapter supports custom providers.
- Skeleton-first AI workflow — 4-phase design process (plan → skeleton → content fill via `replace_id` → polish) for more reliable AI-generated layouts.
- Batched AI tools — `calc` accepts arrays of expressions, `stock_photo` fetches all images in parallel, `batch_update` applies multiple property changes in one call, `describe` accepts `ids` array for multi-node inspection.
- AI visual feedback — blue pulsing border on nodes being modified, green flash on completion.
- Auto-depth `describe` — adapts inspection depth to subtree size (small block → deeper, large page → shallower).
- `set_fill` gradient support — linear gradients with `color_end` and `gradient` direction params.
- `render` tool `replace_id` — atomically swap skeleton placeholders with real content.
- MCP `export_image_file` tool for headless PNG rendering.
- Grid layout in AI chat — JSX renderer supports `grid`, `columns`, `rows`, `gap` props.
- Configurable max output tokens in AI provider settings (default 16384).
- Z.ai AI provider with GLM-5, GLM-4.7, GLM-4.6, GLM-4.5 model families.
- MiniMax AI provider with M2.5, M2.1, M2 models.

### Fixed

- Resolve variable-bound fill colors through alias chains.
- Fix SCALE constraint resizing for auto-layout instances.
- Propagate SCALE constraints through instance clone chains.
- Skip self-referencing symbolOverrides on nodes with explicit kiwi properties.
- Fix DSD resolution for swapped instance children.
- Fix instance swap override propagation through clone chains.
- Fix component property override resolution through clone chains.
- Fix text/property overrides clobbered by second transitive sync.

- Fix text rendering with wrong fonts on file open — all font weights (including default family) are now loaded before the first render.
- Fix `weightToStyle` mapping: weight 400 now correctly maps to "Regular" instead of "Medium".
- Fix detached ArrayBuffer crash when switching pages after saving — export worker now copies image buffers before transferring.
- Show warning toast when fonts fail to load, error toast when file open fails.
- Fix FillPicker crash when selecting image fills (missing `ref` import from #92).
- Fix Google Fonts TLS/network errors not cached — failed families no longer retry on every render.
- Fix CJK text garbled when font is unavailable — fallback now renders through paragraph shaper instead of raw `drawText`, preserving CJK characters via the fallback font chain.
- Fix auto-layout overflow in AI-generated designs — text wrapping, min/max constraints, absolute positioning, and FILL sizing now work correctly.
- Fix `layoutAlignSelf` limited to STRETCH — full range supported (CENTER, MAX, MIN, BASELINE).
- Fix hidden auto-layout children losing their dimensions on layout recompute.
- Fix ProviderSettings popover not visible in AI chat.
- Fix paste/copy/cut intercepted by canvas in AI chat input.
- Strip TypeScript casts from AI-generated JSX (`as any`, `as const`).
- Fix parsing complex .fig files crashing on missing GUIDs in component overrides.
- Fix headless text layout using 100×100 default size instead of estimated dimensions — multi-line wrapping now estimated correctly.
- Fix clipboard roundtrip losing properties — clipsContent, constraints, arcData, strokeCap/Join, layoutAlignSelf, textAutoResize, autoRename now preserved in Figma Kiwi serialization.
- Fix MCP headless export crashing on `window.queryLocalFonts` in non-browser runtimes (Bun/Node).
- Fix MCP `export_image` rendering blank text — fonts now loaded before rasterization.
- Fix text always using paragraph rendering with Inter fallback chain (no more missing-font garbling).
- Clip children to rounded corners when `clipsContent` is true.
- Use child shape for drop shadows on transparent containers.
- Treat `FOREGROUND_BLUR` as layer blur wrapping children.
- Fix radial, angular, and diamond gradient rendering.
- Fix .fig export roundtrip: variable GUIDs colliding with document.
- Fix file open dialog not working on first click in Safari.
- Skip variable fonts from local font access, use Google Fonts instead.
- Disable autosave by default.

### Performance

- Offload .fig parsing (unzip + Kiwi decode) to a Web Worker — main thread stays responsive during file open.
- Offload .fig compression to a Web Worker during save (was blocking 450ms+).
- Add instance index (`componentId → Set<nodeId>`) — `getInstances()` is O(1) instead of scanning all nodes.
- Defer graph event subscription until after layout computation during file open — eliminates redundant `syncInstances` calls.
- Cache label collection (sections/components) per scene mutation instead of walking the full tree every frame.
- Blocking font loading — fonts load before first render to ensure correct glyphs.

## 0.9.0 — 2026-03-09

### Added

- XPath query command — `open-pencil query design.fig "//FRAME[@width < 300]"` to find nodes by type, attributes, and tree structure using XPath selectors.
- CSS Grid layout mode — select a frame, click the grid icon in the auto layout toolbar to switch from flex to grid. Configure column/row tracks (fr, fixed px, auto), column and row gaps, and per-side padding. Powered by a [Yoga fork](https://github.com/open-pencil/yoga/tree/grid) with cherry-picked CSS Grid PRs from upstream.
- JSX and Tailwind CSS export for grid layouts — `grid grid-cols-N`, `gap-x-*`/`gap-y-*`, child `col-start-*`/`row-start-*`/`col-span-*`/`row-span-*`.
- Multi-provider AI support — connect to Anthropic, OpenAI, Google AI, or any OpenAI-compatible endpoint directly, in addition to OpenRouter. Per-provider API key storage, provider settings popover, automatic migration from single OpenRouter key.
- Anthropic-compatible provider for custom API endpoints.
- New AI tools: `get_jsx` (JSX roundtrip view), `diff_jsx` (structural diff), `describe` (semantic role, visual style, layout, design issues).
- AI visual verification — `export_image` returns image content to the model for vision-based review.
- API type toggle (Completions/Responses) for OpenAI-compatible providers.
- Figma zoom shortcuts — ⌘0 (100%), ⌘1 (zoom to fit), ⌘2 (zoom to selection), ⇧1/⇧2 alternatives.
- XPath query tool — `query_nodes` for AI/MCP with attribute selectors, tree traversal, and type filtering.

### Changed

- Padding on a frame auto-enables vertical auto-layout.
- AI tools run `computeAllLayouts` after execution — layout updates immediately.
- Enhanced AI system prompt with full JSX prop reference and verification workflow.
- Chat panel preserves messages when toggling UI visibility.
- SceneGraph event bus (nanoevents) — `node:created`, `node:updated`, `node:deleted`, `node:reparented`, `node:reordered` events replace monkey-patching in collab sync and manual render invalidation.
- Replace esbuild-wasm (14 MB) with sucrase (201 KB) for JSX transform — `buildComponent()` and `renderJSX()` now synchronous and browser-compatible.
- `useMagicKeys` keyboard shortcut system — replaces tinykeys with VueUse built-in, cross-platform Meta/Control handling, modifier exclusion for combo conflicts.
- Dev-only debug toolbar for copying chat logs.
- Auto-layout icons in layer tree — vertical (rows), horizontal (columns), and grid icons for auto-layout frames; components keep their purple diamond.
- Frame titles on canvas are now draggable — clicking a selected top-level frame's name label starts a drag.
- Compact layout controls — icon-based gap (↔/↕) and padding (T/R/B/L) inputs instead of text labels.
- Auto-detect horizontal vs vertical direction when wrapping in auto layout (Shift+A).
- Fix alignment grid for vertical layouts — visual positions now match spatial axes.
- Fix grid switch from HUG-sized frames — frame expands to fit children.
- Remove unwanted white fill when wrapping in auto layout.

### Fixed

- Serialize variables, collections, and bindings to `.fig` files — previously lost on save (#65).
- Text nodes created via MCP now render in Figma — emit `derivedTextData` with font metadata and layout size (#64).
- Double-click on layer tree no longer toggles expand/collapse — use the chevron instead.
- Page rename input matches layer rename styling.
- Fix `w="fill"`/`h="fill"` in JSX renderer — now direction-aware based on parent flex axis.
- Fix text auto-resize defaulting to fixed 100×100 — text without explicit width uses `WIDTH_AND_HEIGHT`.
- Fix `clipsContent` not propagated to Yoga — frames with clip enabled now set `Overflow.Hidden`.
- Fix `COUNTER_ALIGN_MAP` mapping stretch to `MIN` instead of `STRETCH`.
- Fix JSX export omitting x/y for absolute-positioned children.
- Fix JSX export ignoring `textAutoResize` for text sizing.
- Fix drag terminating on mouseleave — drags now continue outside the canvas.
- Fix `export_image` stack overflow on large nodes — chunked base64 encoding.
- Undo support for auto-layout reorder, layer tree reorder, and drag reparent.
- Page snapshot undo for AI tool mutations.
- Fix collab sync for same-parent reorder — `node:reordered` events now propagated to Yjs peers.
- Fix orphaned instances on clipboard paste — detach to FRAME when component is missing.
- Fix text typography lost on Figma clipboard import — preserve fontFamily, fontWeight, fontSize, lineHeight.
- Fix `copyFill` missing `gradientTransform` and `imageTransform` — gradient fills now round-trip correctly.

### Performance

- Event-driven rendering and component sync — `SceneGraph` emits typed events on mutations; `requestRender()` calls reduced from 94 to 22, component instance sync uses microtask batching with deduplication.
- Replace `structuredClone` with typed copy helpers for fills, strokes, effects, and style runs (~24× faster in hot paths).
- Filter .fig unzip to only decompress canvas and image entries, skipping metadata cruft.

## 0.8.0 — 2026-03-07

### Added

- Mobile layout & PWA — responsive editor with touch-optimized toolbar, swipeable bottom drawer (layers/properties/design/code), HUD overlay, and installable PWA with icons and service worker.
- Tailwind CSS v4 JSX export — export selections as HTML with Tailwind utility classes (`<div className="flex gap-4 p-3">`) from the Code panel, CLI (`bun open-pencil export --format jsx --style tailwind`), or programmatically via `sceneNodeToJSX(id, graph, 'tailwind')`. Supports layout, sizing, colors, border radius, opacity, rotation, overflow, shadows, blur, and typography. Uses v4 spacing semantics (px/4 multiplier) with automatic fallback to arbitrary values.
- Code panel format toggle — switch between OpenPencil (custom components) and Tailwind (HTML + utility classes) output.
- Homebrew tap — `brew install open-pencil/tap/open-pencil` for macOS (arm64 + x64), auto-updated on each release.
- Double-click to rename layers — inline rename in layer panel, shared `useInlineRename` composable.
- New AI/MCP tools: `analyze_colors`, `analyze_typography`, `analyze_spacing`, `analyze_clusters`, `diff_create`, `diff_show`, `get_components`, `get_current_page`, `arrange`, `node_to_component`.
- CLI-to-app RPC bridge — all CLI commands work against the running app when no file is specified. Start the app, then run `bun open-pencil tree` to inspect the live document.
- VitePress docs site — user guide, reference, architecture, and development docs at openpencil.dev with 6 locales (en, de, fr, es, it, pl), SEO (OG tags, hreflang, JSON-LD, sitemap), and dark theme.

### Changed

- Refactor mobile drawer tabs, layout sizing dropdowns, and inline rename to use Reka UI primitives.
- Add shared UI style helpers with tailwind-variants for menus, selects, buttons, and surfaces.
- Unified tool definitions — define once in `packages/core/src/tools/`, automatically available in AI chat, CLI, and MCP.
- Harden FigmaAPI — hide internals via Symbols, freeze arrays, fix `layoutSizing`, 30+ new properties and methods.
- Split tools into domain files (read, create, modify, structure, variables, vector, analyze) — easier to navigate and extend.
- Replace inline type definitions with named types (`Color`, `Vector`, `SceneNode`) across the codebase.
- Split 3200-line `renderer.ts` into `packages/core/src/renderer/` with 10 focused files (scene, overlays, fills, strokes, shapes, effects, rulers, labels).
- Centralize all color utilities in `packages/core/src/color.ts` — `colorToHex8`, `colorToCSSCompact`, `normalizeColor`, `colorDistance`; remove 5 duplicate implementations across the codebase.
- Add `geometry.ts` with shared rotation math (`degToRad`, `radToDeg`, `rotatePoint`, `rotatedCorners`, `rotatedBBox`).
- Extract `isArrayMixed()` helper for multi-selection property panels.

- Add `motion-v` for declarative animations — used in mobile drawer (spring-animated height with pan gestures) and toolbar (layout-animated category switching with directional slide transitions).
- Mobile drawer: replace `useSwipe` + manual rAF animation with `motion.div` `:animate` + `@pan`/`@panEnd`; always-on tab state (no more null `activeRibbonTab`); content stays rendered when closed.
- Mobile toolbar: replace manual `scrollWidth` measuring + inline CSS transitions with `motion.div layout` + `AnimatePresence` directional slide variants.
- Mobile UI cleanup: extract shared `colorToCSS` util to core, `initials` to `src/utils/text`, `toolIcons` to `src/utils/tools`; replace hand-rolled dropdowns with reka-ui Popover/DropdownMenu; narrow `mobileDrawerSnap` type to string union; move magic numbers to constants; disable PWA service worker in dev mode.
- 83 new E2E tests (57 → 140): design panel, code panel, components, copy/paste, multi-page, text editing, keyboard shortcuts, context menu.
- 150 new unit tests (588 → 738): color, undo, snap, vector, style-runs, text-editor.
- 48 new E2E tests (9 spec files) + 26 mutation unit tests + store/canvas test helpers.
- Add `data-test-id` attributes to AppearanceSection, LayoutSection, TypographySection, VariablesDialog, EditorView.

### Fixed

- Fix drawer animation jump on close — single spring transition instead of two-phase.
- Fix `ALL_TOOLS` registry missing newer tools (`analyzeColors`, `diffCreate`, `exportImage`, `arrangeNodes`).
- Fix `renderJSX` typo in tool definitions (`renderJsx` → `renderJSX`).
- Fix all oxlint warnings and tsgo errors — replace `!` non-null assertions in `use-collab.ts` with local const captures.
- Fix broken test imports — stale `../../src/engine/` paths updated to `@open-pencil/core`.
- Fix flaky E2E tests: layers panel navigates to `/demo`, zoom-to-fit test zooms in first, snapshot rendering stabilized with `workers: 1` and `colorScheme: dark`.
- Fix bogus .fig import mappings for `expanded` and `strokeMiterLimit` fields.
- Fix PWA manifest error in dev mode, handle invalid font data gracefully.
- Fix eval response unwrapping and `export_jsx` page selection in RPC bridge.
- Fix automation commands not recomputing layouts after mutations.
- Fix workspace dependency not resolved when installing from npm (switch CI to pnpm publish).

## 0.7.0 — 2026-03-05

### Added

- SVG export — export selections as SVG from the export panel, context menu, CLI (`bun open-pencil export --format svg`), or MCP/AI tools (`export_svg`). Supports rectangles, ellipses, lines, stars, polygons, vectors, text with style runs, gradients, image fills, effects, blend modes, clip paths, and nested groups (#46).
- Copy/Paste as submenu in context menu — Copy as text, Copy as SVG, Copy as PNG (⇧⌘C), Copy as JSX.
- Stroke align (Inside/Center/Outside) with clip-based rendering matching Figma behavior.
- Individual stroke weights per side (Top/Right/Bottom/Left) with side selector dropdown.
- Google Fonts fallback — automatically loads fonts from Google Fonts API when not available locally.
- Auto-save toggle in File menu — disable to prevent automatic writes to the opened .fig file.
- Renderer profiler with in-canvas HUD overlay, GPU timing, and phase instrumentation.

### Changed

- Replace custom color picker with Reka UI Color components (ColorArea, ColorSlider, ColorField) — adds keyboard navigation and accessibility to the color area, hue, and alpha controls.

### Fixed

- CJK text rendering — load a system CJK font (PingFang SC, Microsoft YaHei, Noto Sans CJK) as fallback; falls back to Noto Sans SC from Google Fonts when no system font is available (#48).
- Font registration errors no longer cache invalid font data — `loadFont` only caches after successful CanvasKit registration.
- Fix `render` tool failing on Windows + Bun with "Cannot find module" error (#43).
- Fix hover highlighting nodes from internal component pages — scope hit-test to current page.
- Fix hit-testing on transparent frames and groups — empty containers without fills or strokes are now click-through, clipping parents reject hits outside their bounds, matching Figma behavior.
- Fix instance overrides on .fig import and clipboard paste — resolve guidPaths by overrideKey, handle component swaps (`overriddenSymbolID`), propagate through nested clone chains. Import and paste now share a single override engine.
- Apply Figma component property assignments on import — boolean visibility toggles and instance swaps via `componentPropRefs`/`componentPropAssignments`.
- Apply `derivedSymbolData` sizes on import — containers now shrink correctly when component properties hide children.
- Fix override resolution for nested instance targets — check the current node before searching descendants.
- Fix component property assignments for nested instances — resolve scoped `componentPropAssignments` inside `symbolOverrides` via guidPath, handle `guidValue` for instance swaps, reorder phases so transitive sync doesn't clobber visibility.
- Pixel-perfect vector rendering using pre-computed `fillGeometry`/`strokeGeometry` blobs from .fig files — eliminates white gaps between adjacent stroked shapes.
- Stroke outlines on clipboard paste — convert vectorNetwork paths to filled outlines via CanvasKit when geometry blobs are unavailable.
- Apply `derivedSymbolData` transforms and geometry during import — instance children render at correct scale and position.
- Fix internal pages becoming visible after .fig round-trip — preserve `internalOnly` flag on export.
- Scope layout recomputation to current page for paste/undo/font-load (major speedup on large multi-page files).
- Show loading overlay until all document fonts are loaded (no more partially rendered text).
- Load fonts when switching pages (previously only loaded for the first page).
- Always show visibility toggle on fill, stroke, and effect rows (matches Figma).
- Fix renderer crash on double destroy when closing files quickly.
- Fix .fig page ordering — use deterministic byte comparison for fractional index positions.
- Fix text truncation using `textTruncation` field instead of `textAutoResize`.
- Fix horizontal scrollbar on design and pages panels.
- Style scrollbars for Tauri (thin dark overlay instead of default OS chrome).
- Enable file watcher in Tauri — `watch` feature was missing from `tauri-plugin-fs`.

## 0.6.0 — 2026-03-04

### Added

- Multi-selection properties panel — edit position, size, appearance, fill, stroke, and effects across multiple selected nodes.
- Shared values display normally, differing values show "Mixed".
- W/H inputs in multi-selection mode.
- Flip horizontal/vertical using scale transform instead of rotation.
- Single-node alignment aligns to parent frame bounds.
- ACP agent package — Agent Communication Protocol server for AI coding tools, reusing core ToolDefs.

### Changed

- Apple code signing and notarization for macOS builds.
- Git LFS storage moved from GitHub to Cloudflare R2.

### Fixed

- Fix Figma clipboard paste: extract shared kiwi→SceneNode conversion, fixing broken auto-layout, missing gradient/image fills, effects, style runs, and text properties.
- Fix vector rendering on paste — scale path coordinates from Figma's normalizedSize to actual node bounds.
- Fix pasted instances having no children — populate from component via symbolData when both are in clipboard.
- Detect component sets on import — promote FRAME nodes with VARIANT componentPropDefs to COMPONENT_SET.
- Skip internal canvas on paste — components on Figma's hidden internal page populate instances but are not pasted as visible nodes.
- Apply instance overrides on paste — text content, fills, visibility, layoutGrow, and textAutoResize from symbolOverrides.
- Fix auto-layout child ordering — sort by geometric position instead of z-order position strings.
- Load fonts on paste and .fig import — collect font families from text nodes and load into CanvasKit.
- Text measurement in auto-layout — use CanvasKit paragraph metrics for WIDTH_AND_HEIGHT text nodes.
- Recompute layouts after font loading completes.
- Fix PERCENT line height conversion — was stored as raw value instead of pixels.
- Fix InvalidCharacterError when copying nodes with non-ASCII text.
- Load all font weight/style variants needed by pasted text nodes.
- Fix font loading not registering in core cache.
- Fix halfLeading applied to text measurement — enable only for rendering.
- Clear hover on zoom/pinch to keep scene picture cache valid.
- Fix flip buttons using rotation math instead of actual mirroring.
- Fix flip transform encoding — scale first matrix column only (was incorrectly producing 180° rotation).
- Decode flip state from .fig transform matrix on import.

## 0.5.1 — 2026-03-03

### Fixed

- Fix File → Save crash when document has layer blur effects.

## 0.5.0 — 2026-03-03

### Added

- Effects rendering: drop shadow, inner shadow, shadow spread, layer blur, background blur, foreground blur.
- Text shadows render on glyphs instead of bounding box.
- Multi-file tabs — open multiple documents in tabs within a single window.
- Tab bar with close buttons, middle-click to close, and new tab (+) button.
- Keyboard shortcuts: ⌘N/⌘T new tab, ⌘W close tab, ⌘O opens in new tab.
- Native Tauri menu: File → New and File → Close Tab wired to tab actions.
- Render text from SkPicture cache when fonts are missing — pixel-perfect display without the font installed.
- Missing font indicator (⚠) next to font picker in the sidebar.
- Right-click context menu on layers panel — same actions as the canvas context menu.
- 40+ new AI/MCP tools ported from figma-use:
  - Granular set tools: `set_rotation`, `set_opacity`, `set_radius`, `set_minmax`, `set_text`, `set_font`, `set_font_range`, `set_text_resize`, `set_visible`, `set_blend`, `set_locked`, `set_stroke_align`
  - Node operations: `node_bounds`, `node_move`, `node_resize`, `node_ancestors`, `node_children`, `node_tree`, `node_bindings`, `node_replace_with`
  - Variable CRUD: `get_variable`, `find_variables`, `create_variable`, `set_variable`, `delete_variable`, `bind_variable`
  - Collection CRUD: `get_collection`, `create_collection`, `delete_collection`
  - Boolean operations: `boolean_union`, `boolean_subtract`, `boolean_intersect`, `boolean_exclude`
  - Vector path tools: `path_get`, `path_set`, `path_scale`, `path_flip`, `path_move`
  - Create tools: `create_page`, `create_vector`, `create_slice`
  - Viewport: `viewport_get`, `viewport_set`, `viewport_zoom_to_fit`, `page_bounds`
  - Misc: `flatten_nodes`, `list_fonts`
- `set_text_properties` tool: alignment, auto-resize, decoration.
- `set_layout_child` tool: sizing, grow, align_self, positioning.
- 13 MCP server integration tests via `InMemoryTransport`.

### Changed

- Resizable pages/layers split in left panel with reka-ui Splitter.
- Layers tree auto-expands and scrolls to reveal selected node.
- Loading overlay on canvas while opening .fig files.
- Hide internal-only pages (e.g. "Internal Only Canvas" in design systems).
- Render page dividers — pages named with only dashes/asterisks/spaces show as horizontal lines.
- Only show component labels for COMPONENT and COMPONENT_SET, not instances.
- Replace all native `<select>` dropdowns with reka-ui `AppSelect` component.
- Smoother trackpad pinch-to-zoom with `Math.exp` curve and deltaMode normalization.
- Fix font picker dropdown truncating long font names.
- Show explanation in font picker when Local Font Access API unavailable (Safari/Firefox).

- Auto-populate GitHub Release notes from CHANGELOG.md via `ffurrer2/extract-release-notes@v2`.
- Skip already-published npm versions on CI re-runs instead of failing.
- Exclude non-app directories from Vite file watcher.

- Extract shared color constants (`BLACK`, `TRANSPARENT`, `DEFAULT_SHADOW_COLOR`) — replaces 8 inline literals across core.
- Extract shared `NodeContextMenuContent` component to avoid menu duplication.
- Fix `@open-pencil/core` dep in MCP package: `workspace:*` for local dev (pnpm resolves at publish time).
- Replace store thunks with a late-binding proxy.

- Clipboard roundtrip tests: encode to Figma Kiwi binary → decode → verify.
- 9 visual regression snapshot tests for effects rendering.
- Zoom/pan E2E tests and pipeline benchmark.
- MCP server edge-case tests for `find_nodes` and Zod validation.
- 6 unit tests for absolute position cache.

### Fixed

- Fix drop shadow rendering on top of fills — shadow now draws behind opaque content.
- Fix effect property changes not recorded in undo/redo history.
- Fix active tab text invisible against same-color background.
- Fix clipboard "Outside int range" error — `pasteID` used unsigned int exceeding Kiwi's signed 32-bit field.
- Error toasts are now sticky (don't auto-dismiss), with selectable text, copy button, and close button.
- Truncate long node names in export button.

### Performance

- Per-node SkPicture cache for effect rendering — unchanged shadow/blur nodes replay from cache on scene redraws.
- Drop shadows use `MaskFilter` direct draw instead of `saveLayer` offscreen buffers.
- Cached `ImageFilter`, `MaskFilter`, reusable effect paint — zero per-frame WASM allocations for effects.
- Reuse GL context on panel resize — swap surface without recreating renderer, preserving all caches.
- Per-frame absolute position cache — avoids repeated parent-chain walks during rendering.
- Optimize zoom/pan smoothness with `shallowReactive`, `useRafFn`, and input coalescing.

## 0.4.2 — 2026-03-02

### Changed

- Import additional properties from Figma clipboard: `layoutAlignSelf`, `clipsContent`, `fontWeight`, `italic`, `letterSpacing`, `lineHeight`.
- Convert `letterSpacing` PERCENT units to pixels based on font size.

- 7 new clipboard import unit tests (14 total).

### Fixed

- Fix Figma clipboard paste: skip non-visual node types (variables, widgets, stickies, connectors).
- Fix text not rendering after paste — `letterSpacing` from Figma is a `{value, units}` object, was passed as-is → `NaN` broke CanvasKit paragraph layout.
- Fix undo/redo for Figma paste — no undo entry was recorded; redo duplicated `childIds`.
- Center pasted Figma content in viewport instead of using original coordinates.
- Compute auto-layouts after clipboard paste (same as .fig import and demo creation).

## 0.4.1 — 2026-03-02

### Changed

- Highlight copy & paste with Figma in README and feature docs.
- Replace "fig-kiwi" format name with "Kiwi binary" — the format is shared between .fig files and clipboard.

### Fixed

- Fix text disappearing after hover when SkPicture cache was recorded before fonts loaded.
- Invalidate scene picture cache on font load to prevent stale fallback text.

## 0.4.0 — 2026-03-02

### Added

- MCP server (`@open-pencil/mcp`) — 29 tools for headless .fig editing via stdio (Claude Code, Cursor, Windsurf) or HTTP (Hono + Streamable HTTP with sessions).
- `openpencil-mcp` and `openpencil-mcp-http` binaries — install globally via `bun add -g @open-pencil/mcp`.

### Changed

- All packages emit JS via tsgo + fix-esm-import-path — `@open-pencil/core` and `@open-pencil/mcp` work on Node.js without Bun.
- Core package exports: `bun` condition → src (dev), `import` condition → dist (npm consumers).
- `@open-pencil/mcp` added to CI publish workflow.

## 0.3.2 — 2026-03-02

### Changed

- Visual regression tests for SkPicture cache: hover on/off cycle, multiple cycles, mouse hover, scene change + hover.
- Type `window.__OPEN_PENCIL_STORE__` globally, remove ad-hoc casts from tests.

### Performance

- Re-apply SkPicture scene caching for ~7x faster pan/zoom (0.98ms vs 6.8ms per frame at 500 nodes).

## 0.3.1 — 2026-03-02

### Fixed

- Fix text disappearing after hovering a frame (revert SkPicture scene caching).
- Fix macOS startup hang: async font loading, show window on reopen.

## 0.3.0 — 2026-03-01

### Fixed

- Fix npm publish: use pnpm for workspace dependency resolution with provenance.
- CLI version now reads from package.json instead of hardcoded value.
- Update README: accurate app size (~7 MB), streamlined feature list, current project structure.

### Performance

- SkPicture scene caching — pan/zoom replays cached display list instead of re-rendering all nodes.
- Cache vector network paths — avoid rebuilding WASM paths every frame.
- Cache ruler and pen overlay paints — eliminate 10 WASM Paint allocations per frame.
- Only enable `preserveDrawingBuffer` in test mode.
- Hoist URL param parsing out of render loop.

## 0.2.1 — 2026-03-01

### Changed

- Panel header with app logo, editable document name, and sidebar toggle.
- ⌘\\ to toggle side panels for distraction-free canvas.
- Panels hidden by default on mobile (< 768px).
- Floating bar with logo, filename, and restore button when panels hidden.
- Always show local user avatar in collab header.
- Touch support for pan and pinch-zoom on iOS.

### Performance

- Stubbed shiki to remove 9MB of unused language grammars (20MB → 11MB bundle).

## 0.2.0 — 2026-03-01

### Added

- Real-time P2P collaboration via Trystero (WebRTC) + Yjs CRDT.
- Peer-to-peer sync — no server relay, zero hosting cost.
- WebRTC signaling via MQTT public brokers.
- STUN (Google, Cloudflare) + TURN (Open Relay) for NAT traversal.
- Awareness protocol: live cursors, selections, presence.
- Figma-style colored cursor arrows with name pills.
- Click peer avatar to follow their viewport, click again to stop.
- Stale cursor cleanup on peer disconnect.
- Local persistence via y-indexeddb — room survives page refresh.
- Share link at `/share/<room-id>` with vue-router.
- Secure room IDs via `crypto.getRandomValues()`.
- Removed Cloudflare Durable Object relay server (`packages/collab/`).

### Changed

- Toast notifications via Reka UI Toast — top-center blue pill for info, red for errors.
- Global error handler (window.error + unhandledrejection) shows errors as toasts.
- Link copied toast on share and copy link actions.
- HsvColorArea extracted as shared component (ColorPicker + FillPicker).
- Scrollable app menu without visible scrollbar.
- Selection broadcasting to remote peers.

## 0.1.0-alpha — 2026-03-01

First public alpha. The editor is functional but not production-ready.

### Added

- Canvas rendering via CanvasKit (Skia WASM) on WebGL surface.
- Rectangle, Ellipse, Line, Polygon, Star drawing tools.
- Pen tool with vector network model (bezier curves, open/closed paths).
- Inline text editing on canvas with phantom textarea for input/IME.
- Rich text formatting: bold, italic, underline per-character via style runs.
- Font picker with system font enumeration (font-kit on desktop, Local Font Access API in browser).
- Auto-layout via Yoga WASM (direction, gap, padding, justify, align, child sizing).
- Components, instances, component sets with live sync and override preservation.
- Variables with collections, modes, color bindings, alias chains.
- Undo/redo for all operations (inverse-command pattern).
- Snap guides with rotation-aware edge/center snapping.
- Canvas rulers with selection range badges.
- Marquee selection, multi-select, resize handles, rotation.
- Group/ungroup, z-order, visibility, lock.
- Sections with title pills and auto-adoption of overlapping nodes.
- Multi-page documents with independent viewport state.
- Hover highlight following node geometry (ellipses, rounded rects, vectors).
- Context menu with clipboard, z-order, grouping, component, and visibility actions.
- Color picker with HSV, gradients (linear, radial, angular, diamond), image fills.
- Properties panel: position, appearance, fill, stroke, effects, typography, layout, export.
- ScrubInput drag-to-change number controls.
- Resizable side panels via reka-ui Splitter.

- .fig file import via Kiwi binary codec (194 definitions, ~390 fields).
- .fig file export with Kiwi encoding, Zstd compression, thumbnail generation.
- Figma clipboard: copy/paste between OpenPencil and Figma.
- Round-trip fidelity for supported node types.

- Built-in AI chat in properties panel (⌘J).
- Direct browser → OpenRouter communication, no backend.
- Model selector: Claude, Gemini, GPT, DeepSeek, Qwen, Kimi, Llama.
- 10 AI tools: create_shape, set_fill, set_stroke, update_node, set_layout, delete_node, select_nodes, get_page_tree, get_selection, rename_node.
- Streaming markdown responses (vue-stream-markdown).
- Tool call timeline with collapsible details.

- JSX export of selected nodes with Tailwind-like shorthand props.
- Syntax highlighting via Prism.js.
- Copy to clipboard.

- `info` — document stats, node types, fonts.
- `tree` — visual node tree.
- `find` — search by name/type.
- `export` — render to PNG/JPG/WEBP at any scale.
- `node` — detailed properties by ID.
- `pages` — list pages with node counts.
- `variables` — list design variables and collections.
- `eval` — run scripts with Figma-compatible plugin API.
- `analyze colors` — color palette usage.
- `analyze typography` — font/size/weight distribution.
- `analyze spacing` — gap/padding values.
- `analyze clusters` — repeated patterns.
- All commands support `--json`.

- Scene graph with flat Map storage and parentIndex tree.
- FigmaAPI with ~65% Figma plugin API compatibility.
- JSX renderer (TreeNode builder functions with shorthand props).
- Kiwi binary codec (encode/decode).
- Vector network blob encoder/decoder.

- Tauri v2 (~5 MB).
- Native menu bar, save/open dialogs.
- System font enumeration via font-kit.
- Zstd compression in Rust.
- macOS and Windows builds via GitHub Actions.

- Runs at [app.openpencil.dev](https://app.openpencil.dev).
- No installation required.
- File System Access API for save/open (Chrome/Edge), download fallback elsewhere.

- [openpencil.dev](https://openpencil.dev) — VitePress site with user guide, reference, and development docs.
- Deployed via Cloudflare Pages.
