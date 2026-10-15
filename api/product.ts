declare const process: { env: Record<string, string | undefined> }

type CacheEntry = { expiresAt: number; status: number; body: unknown }

const cache = new Map<string, CacheEntry>()
const PRODUCT_CACHE_MS = 24 * 60 * 60 * 1000
const NOT_FOUND_CACHE_MS = 10 * 60 * 1000
const fields = [
  'code', 'product_name', 'generic_name', 'brands', 'quantity', 'product_quantity',
  'product_quantity_unit', 'image_front_url', 'categories_tags',
].join(',')

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function validBarcode(value: string) {
  const code = normalizeBarcode(value)
  if (![8, 12, 13, 14].includes(code.length)) return false
  const digits = [...code].map(Number)
  const checkDigit = digits.pop()!
  const sum = digits.reduce((total, digit, index) => total + digit * ((digits.length - index) % 2 === 1 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

function text(value: unknown, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) || null : null
}

function safeImage(value: unknown) {
  const candidate = text(value, 1000)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

async function authenticated(request: Request) {
  const token = request.headers.get('authorization')
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!token?.startsWith('Bearer ') || !supabaseUrl || !publishableKey) return false
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: token, apikey: publishableKey } })
  return response.ok
}

async function handle(request: Request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
  if (!await authenticated(request)) return json({ error: 'Sign in to scan packaged products.' }, 401)
  const barcode = normalizeBarcode(new URL(request.url).searchParams.get('barcode') || '')
  if (!validBarcode(barcode)) return json({ error: 'Scan a valid UPC, EAN, or GTIN barcode.' }, 400)

  const cached = cache.get(barcode)
  if (cached && cached.expiresAt > Date.now()) return json(cached.body, cached.status)

  const url = `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(fields)}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mise/0.1.0 (https://misekitchen-ten.vercel.app)' },
  })
  if (response.status === 404) {
    const body = { error: 'This product is not in Open Food Facts yet.', code: 'product_not_found', barcode }
    cache.set(barcode, { expiresAt: Date.now() + NOT_FOUND_CACHE_MS, status: 404, body })
    return json(body, 404)
  }
  if (!response.ok) return json({ error: 'Product lookup is temporarily unavailable.' }, 502)
  const payload = await response.json().catch(() => null) as { product?: Record<string, unknown> } | null
  const product = payload?.product
  if (!product) return json({ error: 'This product is not in Open Food Facts yet.', code: 'product_not_found', barcode }, 404)

  const body = { data: {
    barcode,
    name: text(product.product_name) || text(product.generic_name) || 'Packaged product',
    genericName: text(product.generic_name), brand: text(product.brands),
    quantityText: text(product.quantity, 80),
    packageAmount: typeof product.product_quantity === 'number' && product.product_quantity > 0 ? product.product_quantity : null,
    packageUnit: text(product.product_quantity_unit, 24), productImageUrl: safeImage(product.image_front_url),
    categories: Array.isArray(product.categories_tags) ? product.categories_tags.map((value) => text(value, 80)).filter(Boolean).slice(0, 12) : [],
    productSource: 'open-food-facts',
  } }
  cache.set(barcode, { expiresAt: Date.now() + PRODUCT_CACHE_MS, status: 200, body })
  return json(body)
}

export default {
  async fetch(request: Request) {
    try { return await handle(request) }
    catch { return json({ error: 'Product lookup is temporarily unavailable.' }, 502) }
  },
}
