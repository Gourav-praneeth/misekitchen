import { describe, expect, it } from 'vitest'
import { acceptKitchenCollections, changedKitchenCollections, kitchenFingerprints, type CollaborativeKitchenSnapshot } from './collaborationSync'

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
})
