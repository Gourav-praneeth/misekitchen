import { describe, expect, it } from 'vitest'
import { recipeIcons } from './recipeIcons'

describe('recipeIcons', () => {
  it('offers a broad, uniquely labeled set of complete-dish icons', () => {
    expect(recipeIcons.length).toBeGreaterThanOrEqual(36)
    expect(new Set(recipeIcons.map(({ icon }) => icon)).size).toBe(recipeIcons.length)
    expect(new Set(recipeIcons.map(({ label }) => label)).size).toBe(recipeIcons.length)
    expect(recipeIcons.every(({ icon, label }) => icon.trim() && label.trim())).toBe(true)
  })
})
