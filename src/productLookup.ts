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

export async function lookupBarcodeProduct(barcodeInput: string, accessToken: string, fetcher: typeof fetch = fetch) {
  const barcode = normalizeBarcode(barcodeInput)
  if (!isValidBarcode(barcode)) throw new Error('Scan a valid UPC, EAN, or GTIN barcode.')
  const response = await fetcher(`/api/product?barcode=${encodeURIComponent(barcode)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await response.json().catch(() => ({})) as ProductLookupPayload
  if (response.status === 404 || payload.code === 'product_not_found') {
    throw new ProductNotFoundError(payload.error || 'Product not found.', barcode)
  }
  if (!response.ok || !payload.data) throw new Error(payload.error || 'Product lookup is temporarily unavailable.')
  return payload.data
}
