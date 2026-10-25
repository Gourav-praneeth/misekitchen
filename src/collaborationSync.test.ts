import { describe, expect, it } from 'vitest'
import { acceptKitchenCollections, acceptKitchenSnapshot, acknowledgeForcedCollections, changedKitchenCollections, changedSnapshotRows, forceKitchenCollections, kitchenFingerprints, pendingForcedCollections, removedSnapshotRowIds, unseenGroceryItemIds, type CollaborativeKitchenSnapshot } from './collaborationSync'

const empty: CollaborativeKitchenSnapshot = {
  inventory: [], grocery: [], stapleGroups: [], staples: [], recipes: [], mealPlan: [], mealPlanTemplates: [],
}

describe('household collection synchronization', () => {
  it('saves only the collection that changed', () => {
    const baseline = kitchenFingerprints(empty)
    const current = kitchenFingerprints({ ...empty, grocery: [{ name: 'Milk', amount: 1, unit: 'item', checked: false }] })
    expect(changedKitchenCollections(current, baseline)).toEqual(['grocery'])
  })

  it('treats staple groups and staple rows as one atomic collection', () => {
    const baseline = kitchenFingerprints(empty)
    const current = kitchenFingerprints({ ...empty, stapleGroups: [{ id: 'weekly', name: 'Weekly', sortOrder: 0 }] })
    expect(changedKitchenCollections(current, baseline)).toEqual(['staples'])
  })

  it('ignores grocery presentation metadata that is not persisted', () => {
    const baseline = kitchenFingerprints({ ...empty, grocery: [{ id: 'milk-item', name: 'Milk', amount: 1, unit: 'item', checked: false }] })
    const decorated = kitchenFingerprints({ ...empty, grocery: [{ id: 'milk-item', name: 'Milk', amount: 1, unit: 'item', checked: false, emoji: '🥛', createdAt: '2026-10-16T12:00:00Z' }] })
    expect(changedKitchenCollections(decorated, baseline)).toEqual([])
  })

  it('accepts only successfully saved collections and can force a pending snapshot', () => {
    const baseline = kitchenFingerprints(empty)
    const changed = kitchenFingerprints({ ...empty, inventory: [{ id: 'milk', name: 'Milk', emoji: '🥛', quantity: 1, unit: 'item', category: 'Dairy', location: 'Fridge', expiresIn: 5 }], grocery: [{ name: 'Oats', amount: 1, unit: 'bag', checked: false }] })
    const accepted = acceptKitchenCollections(baseline, changed, ['inventory'])
    expect(changedKitchenCollections(changed, accepted)).toEqual(['grocery'])
    expect(changedKitchenCollections(changed, accepted, true)).toHaveLength(6)
  })

  it('does not treat a remote row reorder as a household change', () => {
    const first = { ...empty, inventory: [
      { id: 'milk', name: 'Milk', emoji: '🥛', quantity: 1, unit: 'item', category: 'Dairy' as const, location: 'Fridge' as const, expiresIn: 5 },
      { id: 'oats', name: 'Oats', emoji: '🌾', quantity: 1, unit: 'item', category: 'Pantry' as const, location: 'Pantry' as const, expiresIn: 90 },
    ] }
    const reordered = { ...first, inventory: [...first.inventory].reverse() }
    expect(changedKitchenCollections(kitchenFingerprints(reordered), kitchenFingerprints(first))).toEqual([])
  })

  it('preserves unrelated concurrent additions by saving only local row deltas', () => {
    const baseline = [{ id: 'milk', name: 'Milk' }]
    const local = [...baseline, { id: 'oats', name: 'Oats' }]
    const remote = [...baseline, { id: 'eggs', name: 'Eggs' }]
    const upserts = changedSnapshotRows(local, baseline)
    const merged = [...remote.filter((row) => !upserts.some((upsert) => upsert.id === row.id)), ...upserts]
    expect(merged.map((row) => row.id).sort()).toEqual(['eggs', 'milk', 'oats'])
    expect(removedSnapshotRowIds(local, baseline)).toEqual([])
  })

  it('does not overwrite a remote edit when the same local row was unchanged', () => {
    const baseline = [{ id: 'milk', name: 'Milk' }]
    const local = [...baseline, { id: 'oats', name: 'Oats' }]
    expect(changedSnapshotRows(local, baseline)).toEqual([{ id: 'oats', name: 'Oats' }])
  })

  it('deletes only rows removed from the local baseline', () => {
    const baseline = [{ id: 'milk' }, { id: 'oats' }]
    const local = [{ id: 'oats' }]
    expect(removedSnapshotRowIds(local, baseline)).toEqual(['milk'])
  })

  it('forces unchanged restored rows to upsert after an older deletion', () => {
    const rows = [{ id: 'legacy-row', name: 'Legacy row' }]
    expect(changedSnapshotRows(rows, rows)).toEqual([])
    expect(changedSnapshotRows(rows, rows, true)).toEqual(rows)
  })

  it('advances only successfully saved collections in the baseline snapshot', () => {
    const baseline = { ...empty, inventory: [{ id: 'milk', name: 'Milk', emoji: '🥛', quantity: 1, unit: 'item', category: 'Dairy' as const, location: 'Fridge' as const, expiresIn: 5 }] }
    const current = { ...baseline, grocery: [{ id: 'oats', name: 'Oats', amount: 1, unit: 'bag', checked: false }] }
    expect(acceptKitchenSnapshot(baseline, current, ['grocery'])).toEqual(current)
    expect(acceptKitchenSnapshot(baseline, { ...current, inventory: [] }, ['grocery']).inventory).toEqual(baseline.inventory)
  })

  it('keeps a newer forced restore pending when an older save finishes', () => {
    const deletion = forceKitchenCollections({}, ['inventory'])
    const restoration = forceKitchenCollections(deletion, ['inventory'])
    expect(acknowledgeForcedCollections(restoration, deletion)).toEqual(restoration)
    expect(pendingForcedCollections(restoration)).toEqual(['inventory'])
    expect(acknowledgeForcedCollections(restoration, restoration)).toEqual({})
  })

  it('restores a legacy row without removing another member’s concurrent addition', () => {
    const baseline = [{ id: 'legacy-milk', name: 'Milk' }]
    const remoteAfterDeletion = [{ id: 'remote-eggs', name: 'Eggs' }]
    const restoredLocal = [...baseline]
    const forcedUpserts = changedSnapshotRows(restoredLocal, baseline, true)
    const reconciled = [
      ...remoteAfterDeletion.filter((row) => !forcedUpserts.some((upsert) => upsert.id === row.id)),
      ...forcedUpserts,
    ]

    expect(reconciled.map((row) => row.id).sort()).toEqual(['legacy-milk', 'remote-eggs'])
    expect(removedSnapshotRowIds(restoredLocal, baseline)).toEqual([])
  })

  it('can force an unchanged legacy collection to save again', () => {
    const fingerprint = kitchenFingerprints(empty)
    const forced = forceKitchenCollections({}, ['grocery'])
    expect(changedKitchenCollections(fingerprint, fingerprint)).toEqual([])
    expect(pendingForcedCollections(forced)).toEqual(['grocery'])
  })

  it('shows new grocery rows only to another household member after their last visit', () => {
    const items = [
      { id: 'own', name: 'Milk', amount: 1, unit: 'item', checked: false, createdBy: 'member-a', createdAt: '2026-10-24T18:00:00Z' },
      { id: 'remote-new', name: 'Oats', amount: 1, unit: 'item', checked: false, createdBy: 'member-b', createdAt: '2026-10-24T18:05:00Z' },
      { id: 'remote-seen', name: 'Eggs', amount: 1, unit: 'item', checked: false, createdBy: 'member-b', createdAt: '2026-10-24T17:45:00Z' },
    ]
    expect([...unseenGroceryItemIds(items, 'member-a', '2026-10-24T18:00:00Z')]).toEqual(['remote-new'])
  })

  it('initializes an existing grocery list as already seen', () => {
    const items = [{ id: 'existing', name: 'Milk', amount: 1, unit: 'item', checked: false, createdBy: 'member-b', createdAt: '2026-10-24T18:00:00Z' }]
    expect([...unseenGroceryItemIds(items, 'member-a', null, new Date('2026-10-24T18:10:00Z').getTime())]).toEqual([])
  })

  it('does not relabel an edited item as new but does label a later re-addition', () => {
    const cutoff = '2026-10-24T18:00:00Z'
    const items = [
      { id: 'edited-existing', name: 'Oat milk', amount: 2, unit: 'cartons', checked: false, createdBy: 'member-b', createdAt: '2026-10-24T17:30:00Z' },
      { id: 'readded-later', name: 'Eggs', amount: 1, unit: 'dozen', checked: false, createdBy: 'member-b', createdAt: '2026-10-24T18:05:00Z' },
    ]

    expect([...unseenGroceryItemIds(items, 'member-a', cutoff)]).toEqual(['readded-later'])
  })
})
