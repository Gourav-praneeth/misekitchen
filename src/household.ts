export function normalizeInviteCode(value: string) {
  return value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 10)
}

export function inviteCodeIsValid(value: string) {
  return /^[A-F0-9]{10}$/.test(normalizeInviteCode(value))
}
