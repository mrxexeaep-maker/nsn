import { expect, test, useEditorSetupWithClear } from '#tests/e2e/fixtures'

// Figma desktop 126: right-clicking the Appearance eye binds visibility to a boolean or text
// variable; a component layer's own button also lists its boolean properties. While a variable
// decides visibility the eye is disabled, and detaching keeps the visibility it last gave.

const editor = useEditorSetupWithClear('/?test')

interface Fixture {
  componentLayer: string
  plain: string
  flag: string
  state: string
  mode: string
}

async function setup(): Promise<Fixture> {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    const graph = store.graph
    const pageId = store.state.currentPageId
    // The page is cleared between tests; the variables an earlier test made are not.
    for (const id of graph.variableCollections.keys()) graph.removeCollection(id)
    const collection = graph.createCollection('Flags')
    const flag = graph.createVariable('show-icon', 'BOOLEAN', collection.id, true)
    const state = graph.createVariable('state', 'STRING', collection.id, 'yes')
    graph.createVariable('size', 'FLOAT', collection.id, 4)
    const button = graph.createNode('COMPONENT', pageId, { name: 'Button', width: 160, height: 48 })
    const badge = graph.createNode('RECTANGLE', button.id, { name: 'Badge', width: 24, height: 24 })
    const plain = graph.createNode('RECTANGLE', pageId, {
      name: 'Plain',
      x: 300,
      width: 48,
      height: 48
    })
    store.select([plain.id])
    return {
      componentLayer: badge.id,
      plain: plain.id,
      flag: flag.id,
      state: state.id,
      mode: collection.defaultModeId
    }
  })
}

function layer(id: string) {
  return editor.page.evaluate((nodeId) => {
    const node = window.openPencil?.getStore?.().graph.getNode(nodeId)
    return {
      visible: node?.visible,
      variable: node?.boundVariables.visible,
      property: node?.componentPropertyReferences.find((item) => item.field === 'VISIBLE')
        ?.propertyId
    }
  }, id)
}

test('right-clicking the eye binds visibility to a text variable that decides it', async () => {
  const { page } = editor
  const fixture = await setup()
  const appearance = page.getByRole('region', { name: 'Appearance', exact: true })
  const eye = appearance.locator('[data-visibility-toggle]')
  await expect(appearance.getByRole('button', { name: 'Apply variable/property' })).toHaveCount(0)

  await eye.locator('..').click({ button: 'right' })
  const picker = page.getByRole('dialog', { name: 'Apply variable' })
  await expect(picker.getByRole('option')).toHaveText([/show-icon\s*true/, /state\s*yes/])
  await picker.getByRole('option', { name: /state/ }).click()

  await expect(eye).toBeDisabled()
  await expect(appearance.locator('[data-visibility-bound]')).toContainText('state')
  for (const [text, visible] of [
    ['no', false],
    ['On', true],
    ['', false]
  ] as const) {
    await page.evaluate(
      ({ state, mode, text }) =>
        window.openPencil?.getStore?.().updateVariableValue(state, mode, text),
      { ...fixture, text }
    )
    expect(await layer(fixture.plain)).toMatchObject({ visible, variable: fixture.state })
  }

  await appearance
    .locator('[data-visibility-bound]')
    .getByRole('button', { name: 'Detach variable' })
    .click()
  expect(await layer(fixture.plain)).toEqual({
    visible: false,
    variable: undefined,
    property: undefined
  })
  await expect(eye).toBeEnabled()
})

test('a component layer picks a property or a variable, one at a time', async () => {
  const { page } = editor
  const fixture = await setup()
  await page.evaluate((id) => window.openPencil?.getStore?.().select([id]), fixture.componentLayer)
  const appearance = page.getByRole('region', { name: 'Appearance', exact: true })
  const apply = appearance.getByRole('button', { name: 'Apply variable/property' })
  const picker = page.getByRole('dialog', { name: 'Apply variable/property' })

  await apply.click()
  await picker.getByRole('button', { name: 'Create property…' }).click()
  const property = (await layer(fixture.componentLayer)).property
  expect(property).toBeDefined()

  await apply.click()
  await expect(picker.getByRole('group', { name: 'Properties in Button' })).toBeVisible()
  await picker.getByRole('option', { name: /show-icon/ }).click()
  expect(await layer(fixture.componentLayer)).toMatchObject({
    variable: fixture.flag,
    property: undefined
  })

  await page.evaluate(() => window.openPencil?.getStore?.().undo.undo())
  expect(await layer(fixture.componentLayer)).toMatchObject({ variable: undefined, property })
})
