import { isValidBarcode, normalizeBarcode, type BarcodeProduct } from './productIdentity'

type ProductLookupPayload = {
  data?: BarcodeProduct & { categories?: string[] }
  error?: string
  code?: string
}

export class ProductNotFoundError extends Error {
  barcode: string

  constructor(message: string, barcode: string) {
    super(message)
    this.name = 'ProductNotFoundError'
    this.barcode = barcode
  }
}

class ProductLookupRequestError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'ProductLookupRequestError'
    this.retryable = retryable
  }
}

export async function lookupBarcodeProduct(barcodeInput: string, accessToken: string, fetcher: typeof fetch = fetch, timeoutMs = 7000) {
  const barcode = normalizeBarcode(barcodeInput)
  if (!isValidBarcode(barcode)) throw new Error('Scan a valid UPC, EAN, or GTIN barcode.')

  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(`/api/product?barcode=${encodeURIComponent(barcode)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      const payload = await response.json().catch(() => ({})) as ProductLookupPayload
      if (response.status === 404 || payload.code === 'product_not_found') {
        throw new ProductNotFoundError(payload.error || 'Product not found.', barcode)
      }
      if (!response.ok || !payload.data) {
        const error = new ProductLookupRequestError(payload.error || 'Product lookup is temporarily unavailable.', response.status >= 500 || response.status === 429)
        if (!error.retryable) throw error
        lastError = error
        continue
      }
      return payload.data
    } catch (error) {
      if (error instanceof ProductNotFoundError) throw error
      if (error instanceof ProductLookupRequestError && !error.retryable) throw error
      lastError = error
      if (attempt === 1) break
    } finally {
      globalThis.clearTimeout(timeout)
    }
  }
  if (lastError instanceof DOMException && lastError.name === 'AbortError') throw new Error('Product lookup timed out.')
  throw lastError instanceof Error ? lastError : new Error('Product lookup is temporarily unavailable.')
}
