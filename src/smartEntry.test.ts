import { describe, expect, it } from 'vitest'
import { parseSmartEntry } from './smartEntry'

describe('smart food entry', () => {
  it('separates a natural-language grocery note', () => {
    const items = parseSmartEntry('2 lb chicken breast, a bag of spinach, 6 eggs')

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ name: 'Chicken Breast', quantity: 2, unit: 'lb', category: 'Protein' })
    expect(items[1]).toMatchObject({ name: 'Spinach', quantity: 1, unit: 'bag', category: 'Produce' })
    expect(items[2]).toMatchObject({ name: 'Eggs', quantity: 6, unit: 'eggs', category: 'Protein' })
  })

  it('understands fractions and common unit aliases', () => {
    const [item] = parseSmartEntry('1/2 pounds of salmon')
    expect(item).toMatchObject({ name: 'Salmon', quantity: 0.5, unit: 'lb', emoji: '🐟' })
  })

  it('keeps unknown food editable with safe defaults', () => {
    const [item] = parseSmartEntry('2 jars harissa')
    expect(item).toMatchObject({ name: 'Jars Harissa', quantity: 2, category: 'Other', location: 'Pantry' })
  })
})
