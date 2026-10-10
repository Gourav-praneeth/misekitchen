import { describe, expect, it } from 'vitest'
import { inviteCodeIsValid, normalizeInviteCode } from './household'

describe('shared kitchen invite codes', () => {
  it('normalizes pasted codes without spaces or punctuation', () => {
    expect(normalizeInviteCode(' ab12-cd34 ef ')).toBe('AB12CD34EF')
  })

  it('accepts only complete ten-character invite codes', () => {
    expect(inviteCodeIsValid('AB12CD34EF')).toBe(true)
    expect(inviteCodeIsValid('AB12CD')).toBe(false)
    expect(inviteCodeIsValid('AB12CD34GZ')).toBe(false)
  })
})
