import { describe, expect, it } from 'vitest'
import { isNewerKitchenMessage, releaseSyncLease, sameKitchenContents, syncLeaseKey, tryAcquireSyncLease } from './multiTabSync'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('multi-tab sync lease', () => {
  it('allows one writer and rejects another until the lease is released', () => {
    const storage = memoryStorage()
    const key = syncLeaseKey('user', 'kitchen')
    expect(tryAcquireSyncLease(storage, key, 'tab-a', 1000)).toBe(true)
    expect(tryAcquireSyncLease(storage, key, 'tab-b', 1001)).toBe(false)
    releaseSyncLease(storage, key, 'tab-a')
    expect(tryAcquireSyncLease(storage, key, 'tab-b', 1002)).toBe(true)
  })

  it('recovers a lease left behind by a closed tab after it expires', () => {
    const storage = memoryStorage()
    const key = syncLeaseKey('user', 'kitchen')
    expect(tryAcquireSyncLease(storage, key, 'tab-a', 1000, 100)).toBe(true)
    expect(tryAcquireSyncLease(storage, key, 'tab-b', 1101, 100)).toBe(true)
  })

  it('only accepts newer messages from another tab', () => {
    expect(isNewerKitchenMessage(4, 5, 'tab-b', 'tab-a')).toBe(true)
    expect(isNewerKitchenMessage(5, 5, 'tab-b', 'tab-a')).toBe(false)
    expect(isNewerKitchenMessage(4, 6, 'tab-a', 'tab-a')).toBe(false)
  })

  it('treats snapshots with only different save timestamps as identical', () => {
    const first = { householdId: 'kitchen', inventory: [{ id: 'milk', quantity: 1 }], savedAt: '2026-10-14T10:00:00Z' }
    const second = { ...first, savedAt: '2026-10-14T10:00:01Z' }
    expect(sameKitchenContents(first, second)).toBe(true)
    expect(sameKitchenContents(first, { ...second, inventory: [{ id: 'milk', quantity: 2 }] })).toBe(false)
  })

  it('ignores top-level collection ordering without hiding item changes', () => {
    const first = { inventory: [{ id: 'milk', quantity: 1 }, { id: 'eggs', quantity: 6 }] }
    const reordered = { inventory: [{ id: 'eggs', quantity: 6 }, { id: 'milk', quantity: 1 }] }
    expect(sameKitchenContents(first, reordered)).toBe(true)
    expect(sameKitchenContents(first, { inventory: [{ id: 'eggs', quantity: 5 }, { id: 'milk', quantity: 1 }] })).toBe(false)
  })

  it('orders remembered products by barcode across tabs', () => {
    const first = { productMemory: [{ barcode: '034000470693', name: 'Milk' }, { barcode: '3017624010701', name: 'Nutella' }] }
    const second = { productMemory: [...first.productMemory].reverse() }
    expect(sameKitchenContents(first, second)).toBe(true)
  })
})
