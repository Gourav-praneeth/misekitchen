import { describe, expect, it } from 'vitest'
import { activeStorageAreas, currentStorageAreaId, defaultStorageAreas, foodGroupForLegacyCategory, legacyCategoryForFoodGroup, legacyLocationForCondition, storageAreaForId } from './storageAreas'

describe('storage areas and legacy compatibility', () => {
  it('ships the five household locations in a stable order', () => {
    expect(defaultStorageAreas.map((area) => area.id)).toEqual(['fridge', 'freezer', 'pantry', 'spice-rack'])
  })

  it('folds the retired counter location into pantry', () => {
    expect(currentStorageAreaId('counter')).toBe('pantry')
    expect(storageAreaForId(defaultStorageAreas, 'counter').id).toBe('pantry')
  })

  it('hides archived areas and safely falls back to pantry', () => {
    const areas = defaultStorageAreas.map((area) => area.id === 'fridge' ? { ...area, archivedAt: '2026-10-25T00:00:00Z' } : area)
    expect(activeStorageAreas(areas).some((area) => area.id === 'fridge')).toBe(false)
    expect(storageAreaForId(areas, 'missing').id).toBe('pantry')
  })

  it('maps new metadata to fields understood by older clients', () => {
    expect(legacyLocationForCondition('chilled')).toBe('Fridge')
    expect(legacyLocationForCondition('frozen')).toBe('Freezer')
    expect(legacyLocationForCondition('ambient')).toBe('Pantry')
    expect(legacyCategoryForFoodGroup('Spices & seasonings')).toBe('Pantry')
    expect(foodGroupForLegacyCategory('Dairy')).toBe('Dairy & alternatives')
  })
})
