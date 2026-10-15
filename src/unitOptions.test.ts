import { describe, expect, it } from 'vitest'
import { unitOptionFor } from './unitOptions'

describe('unit options', () => {
  it('matches common aliases to a selectable unit', () => {
    expect(unitOptionFor('cup')).toBe('cups')
    expect(unitOptionFor('bags')).toBe('bag')
    expect(unitOptionFor('pounds')).toBe('lb')
  })

  it('leaves an unknown household unit available as custom', () => {
    expect(unitOptionFor('scoop')).toBeNull()
  })
})

