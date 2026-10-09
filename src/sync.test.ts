import { describe, expect, it, vi } from 'vitest'
import { withRetry } from './sync'

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
