import { describe, expect, it } from 'vitest'
import { cleanGroceryReviewItems, groceryReviewStatuses, isValidGroceryReviewItem } from './groceryReview'
import type { GroceryItem } from './types'

const item = (name: string, amount = 1, unit = 'item'): GroceryItem => ({ name, amount, unit, checked: false })

describe('grocery add review', () => {
  it('distinguishes new items, existing-list merges, and duplicate draft merges', () => {
    expect(groceryReviewStatuses(
      [item('Milk', 1, 'cup')],
      [item('milk', 2, 'cups'), item('Apples', 4), item('apples', 6)],
    )).toEqual(['merge-existing', 'new', 'merge-draft'])
  })

  it('requires every visible row to contain a name, positive quantity, and unit', () => {
    expect(isValidGroceryReviewItem(item('Milk', 1, 'cup'))).toBe(true)
    expect(isValidGroceryReviewItem(item('  ', 1, 'cup'))).toBe(false)
    expect(isValidGroceryReviewItem(item('Milk', 0, 'cup'))).toBe(false)
    expect(isValidGroceryReviewItem(item('Milk', 1, '  '))).toBe(false)
  })

  it('trims reviewed values and resets collected state before saving', () => {
    expect(cleanGroceryReviewItems([{ ...item('  Milk  ', 2, ' cups '), checked: true }])).toEqual([
      item('Milk', 2, 'cups'),
    ])
  })
})
