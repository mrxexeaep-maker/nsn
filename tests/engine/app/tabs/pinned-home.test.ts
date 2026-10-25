import { expect, test } from 'bun:test'

import { createTab, ensureHomeTab, getActiveStore, getTabsSnapshot } from '@/app/tabs'

// Its own file, so the tabs start with no Home: Home can't be closed once it exists.
test('pins a missing Home first without taking the front from the design there', () => {
  const design = createTab()
  expect(getTabsSnapshot().some((tab) => tab.kind === 'home')).toBe(false)

  ensureHomeTab()

  expect(getTabsSnapshot().map((tab) => tab.kind)).toEqual(['home', 'document'])
  expect(getActiveStore()).toBe(design.store)
})
