import { describe, expect, it } from 'vitest'
import { addOrUpdateStaple, groceryFromStaples, moveStaple, moveStapleGroup, orderedStaples } from './groceryStaples'
import type { GroceryStaple, GroceryStapleGroup } from './types'

const staples: GroceryStaple[] = [
  { id: 'milk', groupId: 'weekly', name: 'Milk', amount: 1, unit: 'L', sortOrder: 0 },
  { id: 'oats', groupId: 'weekly', name: 'Oats', amount: 2, unit: 'cups', sortOrder: 1 },
]

describe('grocery staples', () => {
  it('turns a staple group into unchecked groceries', () => {
    expect(groceryFromStaples(staples)).toEqual([
      { name: 'Milk', amount: 1, unit: 'L', checked: false },
      { name: 'Oats', amount: 2, unit: 'cups', checked: false },
    ])
  })

  it('updates a compatible household staple instead of duplicating it', () => {
    expect(addOrUpdateStaple(staples, { id: 'milk-ml', groupId: 'weekly', name: 'milk', amount: 1500, unit: 'ml', sortOrder: 2 }))
      .toContainEqual({ id: 'milk', groupId: 'weekly', name: 'Milk', amount: 1.5, unit: 'L', sortOrder: 0 })
  })

  it('reorders staples within their group', () => {
    expect(orderedStaples(moveStaple(staples, 'oats', -1), 'weekly').map((item) => item.id)).toEqual(['oats', 'milk'])
  })

  it('reorders staple groups', () => {
    const groups: GroceryStapleGroup[] = [
      { id: 'weekly', name: 'Weekly', sortOrder: 0 },
      { id: 'costco', name: 'Costco', sortOrder: 1 },
    ]
    expect(moveStapleGroup(groups, 'costco', -1).sort((a, b) => a.sortOrder - b.sortOrder).map((group) => group.id)).toEqual(['costco', 'weekly'])
  })
})
