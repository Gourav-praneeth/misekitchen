import type { Category, FoodGroup, FreshnessPolicy, Location, StorageArea, StorageCondition } from './types'

export const foodGroups: FoodGroup[] = [
  'Protein', 'Produce', 'Dairy & alternatives', 'Grains & starches', 'Legumes',
  'Nuts & seeds', 'Spices & seasonings', 'Condiments & oils', 'Other',
]

export const defaultStorageAreas: StorageArea[] = [
  { id: 'fridge', name: 'Fridge', condition: 'chilled', sortOrder: 0, archivedAt: null },
  { id: 'freezer', name: 'Freezer', condition: 'frozen', sortOrder: 1, archivedAt: null },
  { id: 'pantry', name: 'Pantry', condition: 'ambient', sortOrder: 2, archivedAt: null },
  { id: 'spice-rack', name: 'Spice rack', condition: 'ambient', sortOrder: 3, archivedAt: null },
]

export function activeStorageAreas(areas: StorageArea[]) {
  return areas.filter((area) => !area.archivedAt && area.id !== 'counter').sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

export function storageAreaForId(areas: StorageArea[], id?: string | null) {
  if (id === 'counter') return areas.find((area) => area.id === 'pantry') || defaultStorageAreas[2]
  return areas.find((area) => area.id === id) || defaultStorageAreas.find((area) => area.id === id) || defaultStorageAreas[2]
}

export function currentStorageAreaId(id?: string | null) {
  return !id || id === 'counter' ? 'pantry' : id
}

export function storageAreaIdForLocation(location: Location) {
  return location.toLowerCase()
}

export function legacyLocationForCondition(condition: StorageCondition): Location {
  return condition === 'chilled' ? 'Fridge' : condition === 'frozen' ? 'Freezer' : 'Pantry'
}

export function foodGroupForLegacyCategory(category: Category): FoodGroup {
  return category === 'Dairy' ? 'Dairy & alternatives' : category === 'Pantry' ? 'Other' : category
}

export function legacyCategoryForFoodGroup(group: FoodGroup): Category {
  if (group === 'Protein' || group === 'Produce') return group
  if (group === 'Dairy & alternatives') return 'Dairy'
  if (group === 'Other') return 'Other'
  return 'Pantry'
}

export function freshnessLabel(policy: FreshnessPolicy) {
  return policy === 'tracked' ? 'Expiry tracked' : 'No date needed'
}
