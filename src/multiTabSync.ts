export type SyncLease = { ownerId: string; expiresAt: number }

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function syncLeaseKey(userId: string, householdId: string) {
  return `mise-sync-lease-v1-${userId}-${householdId}`
}

export function tryAcquireSyncLease(storage: StorageLike, key: string, ownerId: string, now = Date.now(), ttl = 5000) {
  let current: SyncLease | null
  try { current = JSON.parse(storage.getItem(key) || 'null') } catch { current = null }
  if (current && current.ownerId !== ownerId && current.expiresAt > now) return false
  storage.setItem(key, JSON.stringify({ ownerId, expiresAt: now + ttl }))
  try { return (JSON.parse(storage.getItem(key) || 'null') as SyncLease | null)?.ownerId === ownerId } catch { return false }
}

export function releaseSyncLease(storage: StorageLike, key: string, ownerId: string) {
  try {
    const current = JSON.parse(storage.getItem(key) || 'null') as SyncLease | null
    if (current?.ownerId === ownerId) storage.removeItem(key)
  } catch { storage.removeItem(key) }
}

export function isNewerKitchenMessage(currentRevision: number, messageRevision: number, senderId: string, ownId: string) {
  return senderId !== ownId && Number.isFinite(messageRevision) && messageRevision > currentRevision
}

export function sameKitchenContents(first: Record<string, unknown>, second: Record<string, unknown>) {
  const withoutVolatileFields = (snapshot: Record<string, unknown>) => Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== 'savedAt').map(([key, value]) => {
      if (!Array.isArray(value)) return [key, value]
      const ordered = [...value].sort((a, b) => {
        const identity = (item: unknown) => {
          if (!item || typeof item !== 'object') return JSON.stringify(item)
          const record = item as Record<string, unknown>
          return String(record.id ?? record.barcode ?? `${record.name ?? ''}:${record.unit ?? ''}:${record.cookedAt ?? ''}`)
        }
        return identity(a).localeCompare(identity(b))
      })
      return [key, ordered]
    }),
  )
  return JSON.stringify(withoutVolatileFields(first)) === JSON.stringify(withoutVolatileFields(second))
}
