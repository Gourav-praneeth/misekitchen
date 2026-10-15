import { mergeInventoryItems } from './inventoryIntelligence'
import type { InventoryItem } from './types'

export function addBarcodeBatchItem(items: InventoryItem[], incoming: InventoryItem) {
  return mergeInventoryItems(items, [incoming]).items
}

export function removeBarcodeBatchItem(items: InventoryItem[], id: string) {
  return items.filter((item) => item.id !== id)
}

export function barcodeBatchLabel(count: number) {
  return `${count} product${count === 1 ? '' : 's'}`
}
