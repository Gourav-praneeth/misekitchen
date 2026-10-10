import { describe, expect, it } from 'vitest'
import { parseSmartEntry, sameFoodAndUnit } from './smartEntry'

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
    expect(item).toMatchObject({ name: 'Harissa', quantity: 2, unit: 'jars', category: 'Other', location: 'Pantry', confidence: 'low' })
  })

  it('accepts receipt-style lines and removes prices and list markers', () => {
    const items = parseSmartEntry('• 2 cartons of milk $7.98\n2. frozen peas x3\n123456 apples $4.25')

    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ name: 'Milk', quantity: 2, unit: 'cartons', category: 'Dairy' })
    expect(items[1]).toMatchObject({ name: 'Peas', quantity: 3, location: 'Freezer' })
    expect(items[2]).toMatchObject({ name: 'Apples', quantity: 1, category: 'Produce' })
  })

  it('understands explicit storage and freshness cues', () => {
    const [frozenChicken, yogurt] = parseSmartEntry('2 lb frozen chicken use within 30 days, yogurt in fridge use tomorrow')

    expect(frozenChicken).toMatchObject({ name: 'Chicken', quantity: 2, unit: 'lb', location: 'Freezer', expiresIn: 30 })
    expect(yogurt).toMatchObject({ name: 'Yogurt', location: 'Fridge', expiresIn: 1 })
  })

  it('supports metric quantities and mixed fractions', () => {
    const [rice, salmon] = parseSmartEntry('500 g rice, 1 1/2 pounds salmon')
    expect(rice).toMatchObject({ quantity: 500, unit: 'g', name: 'Rice' })
    expect(salmon).toMatchObject({ quantity: 1.5, unit: 'lb', name: 'Salmon' })
  })

  it('splits food connectors without breaking compound food names', () => {
    expect(parseSmartEntry('broccoli and a lemon')).toHaveLength(2)
    expect(parseSmartEntry('mac and cheese')).toHaveLength(1)
  })

  it('matches common singular and plural duplicate names', () => {
    expect(sameFoodAndUnit({ name: 'Chicken breasts', unit: 'pounds' }, { name: 'Chicken breast', unit: 'lb' })).toBe(true)
    expect(sameFoodAndUnit({ name: 'Baby spinach', unit: 'bag' }, { name: 'Spinach', unit: 'bag' })).toBe(true)
  })

  it('normalizes receipt abbreviations into useful food details', () => {
    const [chicken, milk, yogurt] = parseSmartEntry('2 lb BNLS SKNLS CHKN BRST\nORG MLK\n4 GRK YGT')

    expect(chicken).toMatchObject({ name: 'Chicken Breast', quantity: 2, unit: 'lb', category: 'Protein', location: 'Fridge' })
    expect(milk).toMatchObject({ name: 'Milk', emoji: '🥛', category: 'Dairy', unit: 'carton' })
    expect(yogurt).toMatchObject({ name: 'Greek Yogurt', quantity: 4, category: 'Dairy', location: 'Fridge' })
  })

  it('uses catalog identities when checking duplicates', () => {
    expect(sameFoodAndUnit({ name: 'GRK YGT', unit: 'cups' }, { name: 'Greek yogurt', unit: 'cup' })).toBe(true)
  })
})
