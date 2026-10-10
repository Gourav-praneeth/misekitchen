import { describe, expect, it, vi } from 'vitest'
import { createLatestSaveQueue, withRetry } from './sync'

describe('cloud retry', () => {
  it('returns immediately when the first save succeeds', async () => {
    const operation = vi.fn().mockResolvedValue('saved')
    expect(await withRetry(operation, 3, async () => {})).toBe('saved')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('retries temporary failures and preserves the final result', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('saved')
    const wait = vi.fn().mockResolvedValue(undefined)

    expect(await withRetry(operation, 3, wait)).toBe('saved')
    expect(operation).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenNthCalledWith(1, 500)
    expect(wait).toHaveBeenNthCalledWith(2, 1000)
  })
})

describe('cloud save ordering', () => {
  it('serializes overlapping saves so the newest snapshot runs last', async () => {
    const queue = createLatestSaveQueue()
    const order: string[] = []
    let finishFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve })
    const first = queue.reserve().run(async () => {
      order.push('first-start')
      await firstGate
      order.push('first-finish')
    })
    const second = queue.reserve().run(async () => { order.push('second') })

    finishFirst?.()

    expect(await first).toEqual({ latest: false })
    expect(await second).toEqual({ latest: true })
    expect(order).toEqual(['first-start', 'first-finish', 'second'])
  })

  it('marks an in-flight save stale as soon as a newer snapshot is reserved', async () => {
    const queue = createLatestSaveQueue()
    let finish: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { finish = resolve })
    const first = queue.reserve().run(() => gate)

    queue.reserve()
    finish?.()

    expect(await first).toEqual({ latest: false })
  })
})
