import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/spoonacular'

describe('Spoonacular server function', () => {
  beforeEach(() => {
    const environment = (globalThis as unknown as { process: { env: Record<string, string> } }).process.env
    environment.VITE_SUPABASE_URL = 'https://example.supabase.co'
    environment.VITE_SUPABASE_PUBLISHABLE_KEY = 'publishable'
    environment.SPOONACULAR_API_KEY = 'private-key'
    vi.restoreAllMocks()
  })

  it('rejects requests without a valid signed-in Supabase user', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    const response = await handler.fetch(new Request('https://mise.test/api/spoonacular?action=search&ingredients=carrots', {
      headers: { Authorization: 'Bearer invalid' },
    }))
    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes recipe search results without exposing the API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 42, title: 'Carrot Soup', image: 'https://img.example/soup.jpg', usedIngredientCount: 1,
        missedIngredientCount: 1, usedIngredients: [{ name: 'carrots', amount: 4, unit: 'whole' }],
        missedIngredients: [{ name: 'stock', amount: 2, unit: 'cups' }],
      }]), { status: 200, headers: { 'X-API-Quota-Used': '3.2', 'X-API-Quota-Request': '1.09' } }))

    const response = await handler.fetch(new Request('https://mise.test/api/spoonacular?action=search&ingredients=carrots-unique-test', {
      headers: { Authorization: 'Bearer valid' },
    }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.data[0]).toMatchObject({ id: 42, title: 'Carrot Soup', missedIngredientCount: 1 })
    expect(payload.quota).toEqual({ used: 3.2, request: 1.09 })
    expect(JSON.stringify(payload)).not.toContain('private-key')
    expect(String(fetchMock.mock.calls[1][0])).toContain('apiKey=private-key')
  })
})
