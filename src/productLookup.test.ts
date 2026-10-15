import { describe, expect, it, vi } from 'vitest'
import { lookupBarcodeProduct, ProductNotFoundError } from './productLookup'

describe('barcode product lookup client', () => {
  it('sends a normalized barcode with the signed-in session', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { barcode: '034000470693', name: 'Milk', productSource: 'open-food-facts' } }))
    const product = await lookupBarcodeProduct('0 34000-47069 3', 'session-token', fetcher as typeof fetch)
    expect(product).toMatchObject({ barcode: '034000470693', name: 'Milk' })
    expect(fetcher).toHaveBeenCalledWith('/api/product?barcode=034000470693', { headers: { Authorization: 'Bearer session-token' } })
  })

  it('distinguishes an unknown product so the UI can offer manual entry', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Not found', code: 'product_not_found' }, { status: 404 }))
    await expect(lookupBarcodeProduct('034000470693', 'session-token', fetcher as typeof fetch))
      .rejects.toBeInstanceOf(ProductNotFoundError)
  })

  it('rejects invalid codes before making a request', async () => {
    const fetcher = vi.fn()
    await expect(lookupBarcodeProduct('12345', 'session-token', fetcher as typeof fetch)).rejects.toThrow('valid UPC')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
