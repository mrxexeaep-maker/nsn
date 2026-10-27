import { describe, expect, test } from 'bun:test'

import { createRebuildQueue, settleChanges } from '#cloud-dev/site'

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

describe('site rebuilds', () => {
  test('run one build at a time and one more for changes made during it', async () => {
    let builds = 0
    let finish: () => void = () => undefined
    const rebuild = createRebuildQueue(
      () =>
        new Promise<void>((resolve) => {
          builds += 1
          finish = resolve
        })
    )
    const first = rebuild()
    await tick()
    // Two changes while the first build runs make one more build, not two.
    void rebuild()
    void rebuild()
    expect(builds).toBe(1)
    finish()
    await tick()
    expect(builds).toBe(2)
    finish()
    await first
    expect(builds).toBe(2)
  })

  test('hand over changes together once they settle', async () => {
    const batches: string[][] = []
    const changes = settleChanges((paths) => batches.push(paths), 20)
    changes.changed('src/a.ts')
    changes.changed('src/b.ts')
    changes.changed('src/a.ts')
    expect(batches).toEqual([])
    await new Promise((resolve) => {
      setTimeout(resolve, 60)
    })
    expect(batches).toEqual([['src/a.ts', 'src/b.ts']])
  })
})
