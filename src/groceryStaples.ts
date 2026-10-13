import { convertAmount } from './measurements'
import { normalizeFoodName } from './smartEntry'
import type { GroceryItem, GroceryStaple, GroceryStapleGroup } from './types'

export function orderedStapleGroups(groups: GroceryStapleGroup[]) {
  return [...groups].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
}

export function orderedStaples(staples: GroceryStaple[], groupId: string) {
  return staples
    .filter((staple) => staple.groupId === groupId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
}

export function groceryFromStaples(staples: GroceryStaple[]): GroceryItem[] {
  return staples.map(({ name, amount, unit }) => ({ name, amount, unit, checked: false }))
}

export function addOrUpdateStaple(staples: GroceryStaple[], candidate: GroceryStaple) {
  const match = staples.find((staple) => staple.groupId === candidate.groupId
    && normalizeFoodName(staple.name) === normalizeFoodName(candidate.name)
    && convertAmount(1, candidate.unit, staple.unit) !== null)
  if (!match) return [...staples, candidate]
  return staples.map((staple) => staple.id === match.id ? {
    ...staple,
    amount: Math.max(staple.amount, convertAmount(candidate.amount, candidate.unit, staple.unit) || candidate.amount),
  } : staple)
}

export function moveStaple(staples: GroceryStaple[], id: string, direction: -1 | 1) {
  const current = staples.find((staple) => staple.id === id)
  if (!current) return staples
  const ordered = orderedStaples(staples, current.groupId)
  const index = ordered.findIndex((staple) => staple.id === id)
  const target = ordered[index + direction]
  if (!target) return staples
  return staples.map((staple) => staple.id === current.id ? { ...staple, sortOrder: target.sortOrder }
    : staple.id === target.id ? { ...staple, sortOrder: current.sortOrder }
      : staple)
}

export function moveStapleGroup(groups: GroceryStapleGroup[], id: string, direction: -1 | 1) {
  const ordered = orderedStapleGroups(groups)
  const index = ordered.findIndex((group) => group.id === id)
  const current = ordered[index]
  const target = ordered[index + direction]
  if (!current || !target) return groups
  return groups.map((group) => group.id === current.id ? { ...group, sortOrder: target.sortOrder }
    : group.id === target.id ? { ...group, sortOrder: current.sortOrder }
      : group)
}
