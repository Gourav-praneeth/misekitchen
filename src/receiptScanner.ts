import { getFoodIntelligence } from './foodCatalog'

export type ReceiptScanProgress = { progress: number; status: string }
export type ReceiptTextAnalysis = { acceptedLines: string[]; reviewLines: string[]; ignoredLines: string[] }

const metadataLine = /(?:\b(?:sub\s*total|grand total|total|sales tax|tax|balance|amount due|change|cash|credit|debit|visa|mastercard|amex|payment|approved|authorization|auth(?:orization)? code|card|terminal|transaction|receipt|order|invoice|cashier|customer|member|loyalty|savings|coupon|thank you|thanks|bob count|items? sold|entry method|sequence|app\s*#?|aid)\b|bottom of basket|www\.|https?:|\b(?:tel(?:ephone)?|phone)\b)/i
const dateLine = /^(?:\d{1,2}[/-]){2}\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?$/i
const phoneLine = /^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}$/
const addressLine = /^\d{1,6}\s+.+\b(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|ln|lane|dr(?:ive)?|way)\b/i
const cityLine = /^[a-z .'-]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?$/i
const nonFoodLine = /\b(?:ksdiapers?|diapers?|cerave|lotion|cream cleanser|scrub mommy|paper towels?|toilet paper|detergent|dish soap|shampoo|conditioner|toothpaste|batter(?:y|ies)|trash bags?)\b/i
const storeLine = /\b(?:costco|wholesale|warehouse|fresh market)\b|^cos[a-z]{2,7}$/i
const discountLine = /(?:\b\d{5,}\s*\/\s*\d{4,}\b|\d+[.,]\d{2}\s*-[A-Z]?\s*$)/i

const costcoAliases: Array<[RegExp, string]> = [
  [/\b(?:orgnc|org(?:anic)?)\s+(?:bs\s+bst|chx\s+ravi?)\b/i, 'Chicken breast'],
  [/\bpasture\s+eggs?\b/i, 'Eggs'],
  [/\b(?:ellenos\s+)?grk\b|\bgr[a-z]{1,3}\s+yog(?:u(?:rt)?)?\b/i, 'Greek yogurt'],
  [/\borg(?:anic)?\s+(?:blues?|bllies)\b/i, 'Blueberries'],
  [/\borg(?:anic)?\s+strawb(?:ry|erries)?\b/i, 'Strawberries'],
  [/\borg(?:anic)?\s+(?:spinch|spinach)\b/i, 'Spinach'],
  [/\borg(?:anic)?\s+(?:bananas?|b[en]?nanas?)\b|\bbenanas?\b/i, 'Bananas'],
  [/\byellow\s+[a-z]?nion\b/i, 'Onions'],
  [/\bfresh\s+garlic\b/i, 'Garlic'],
  [/\bsweet\s+p[a-z]?tato\b/i, 'Sweet potatoes'],
  [/\borg(?:anic)?\s+(?:bellas?|mushrooms?)\b/i, 'Mushrooms'],
  [/\bcot[a-z]{2,6}ge\s+chse\b/i, 'Cottage cheese'],
  [/\borg(?:anic)?\s+(?:grnchbean|green\s+beans?)\b/i, 'Green beans'],
  [/\b(?:organic\s+)?oats\b/i, 'Rolled oats'],
  [/\b(?:dave[a-z']{0,3}\s+21\s+wg|sourdoughrnd|sourdough)\b/i, 'Bread'],
  [/\b(?:org(?:anic)?\s+)?tortilla\b/i, 'Tortillas'],
  [/\b(?:long|mixed)\s+peppers?\b/i, 'Bell peppers'],
  [/\borg(?:anic)?\s+avocados?(?:\s+\d+ct)?\b/i, 'Avocado'],
  [/\b(?:org(?:anic)?\s+)?mandarins?\b/i, 'Oranges'],
  [/\b(?:org(?:anic)?\s+)?celery\b/i, 'Celery'],
  [/\b(?:org(?:anic)?\s+)?tomatoes?\b/i, 'Tomatoes'],
  [/\bcoconut\s+milk\b/i, 'Coconut milk'],
  [/\balmond\s+flour\b/i, 'Flour'],
]

function normalizedLine(value: string) {
  return value.replace(/[|]/g, ' ').replace(/[“”]/g, '').replace(/^[^a-z0-9]+/i, '').replace(/\s+/g, ' ').trim()
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function receiptItemName(line: string) {
  const multiplied = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[x@]\s*\$?\d+(?:[.,]\d{2})\b/i)
  if (multiplied) return `${multiplied[2]} ${multiplied[1]}`
  let value = line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/^\s*[A-Z£\s]{0,8}\d{4,10}\s+/i, '')
    .replace(/^\s*[A-Z£]{0,3}\s*\d{4,10}\s+/i, '')
    .replace(/^\s*[A-Z£]{1,3}\s+(?=\d{4,10}\b)/i, '')
    .replace(/^\s*\d{4,10}\s+/, '')
    .replace(/\s+(?:[$£€]\s*)?\d+[.,]\d{2}\s*-?[A-Z]?\s*$/i, '')
    .replace(/\s+\d+[.,]\d{2}\b.*$/i, '')
    .replace(/\s+(?:F|T|N)\s*$/i, '')
    .replace(/\b(?:orgnc|organic|org)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  for (const [pattern, replacement] of costcoAliases) {
    if (pattern.test(line) || pattern.test(value)) { value = replacement; break }
  }
  return value
}

function obviousMetadata(line: string, index: number, lines: string[]) {
  const storeHeader = index < 5 && (storeLine.test(line) || [lines[index + 1], lines[index + 2]].some((next) => next && (addressLine.test(next) || phoneLine.test(next))))
  return storeHeader || metadataLine.test(line) || dateLine.test(line) || phoneLine.test(line) || addressLine.test(line) || cityLine.test(line)
}

function aggregateLines(lines: string[]) {
  const order: string[] = []
  const entries = new Map<string, { line: string; count: number }>()
  for (const line of lines) {
    const intelligence = getFoodIntelligence(line)
    const key = intelligence ? `food:${intelligence.profile.id}` : `line:${normalizedKey(line)}`
    const current = entries.get(key)
    if (current) current.count += 1
    else { entries.set(key, { line, count: 1 }); order.push(key) }
  }
  return order.map((key) => { const entry = entries.get(key)!; return entry.count > 1 ? `${entry.count} ${entry.line}` : entry.line })
}

export function analyzeReceiptText(rawText: string): ReceiptTextAnalysis {
  const accepted: string[] = []
  const review: string[] = []
  const ignored: string[] = []
  const lines = rawText.split(/\r?\n/).map(normalizedLine).filter(Boolean)
  lines.forEach((line, index) => {
    if (line.length < 2 || !/[a-z]/i.test(line) || obviousMetadata(line, index, lines) || discountLine.test(line) || nonFoodLine.test(line)) {
      if (line.length > 1) ignored.push(line)
      return
    }
    const item = receiptItemName(line)
    if (item.length < 2 || !/[a-z]{2}/i.test(item)) { ignored.push(line); return }
    if (getFoodIntelligence(item)) accepted.push(item)
    else if (/^[a-z][a-z0-9 '&./-]{2,50}$/i.test(item) && /[a-z]{4}/i.test(item) && !/^detected\b/i.test(item)) review.push(item)
    else ignored.push(line)
  })
  return {
    acceptedLines: aggregateLines(accepted),
    reviewLines: aggregateLines(review),
    ignoredLines: Array.from(new Set(ignored.map(normalizedLine))).slice(0, 40),
  }
}

export function cleanReceiptText(rawText: string) {
  const analysis = analyzeReceiptText(rawText)
  return [...analysis.acceptedLines, ...analysis.reviewLines].join('\n')
}

type Bounds = { left: number; top: number; right: number; bottom: number }

function paperBounds(data: Uint8ClampedArray, width: number, height: number): Bounds | null {
  const mask = new Uint8Array(width * height)
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2]
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue)
    mask[index] = luminance > 128 && spread < 85 ? 1 : 0
  }
  const visited = new Uint8Array(mask.length)
  let best: (Bounds & { area: number }) | null = null
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue
    const queue = [start]
    visited[start] = 1
    let cursor = 0, area = 0, left = width, right = 0, top = height, bottom = 0
    while (cursor < queue.length) {
      const position = queue[cursor++], x = position % width, y = Math.floor(position / width)
      area += 1; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
      for (const neighbor of [position - 1, position + 1, position - width, position + width]) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) continue
        if (Math.abs((neighbor % width) - x) > 1) continue
        visited[neighbor] = 1; queue.push(neighbor)
      }
    }
    if (!best || area > best.area) best = { left, right, top, bottom, area }
  }
  return !best || best.area < mask.length * 0.04 ? null : best
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare receipt image.')), 'image/jpeg', 0.94))
}

async function prepareReceiptImages(file: File) {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return [file as Blob]
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const previewScale = Math.min(1, 180 / Math.max(bitmap.width, bitmap.height))
    const preview = document.createElement('canvas')
    preview.width = Math.max(1, Math.round(bitmap.width * previewScale)); preview.height = Math.max(1, Math.round(bitmap.height * previewScale))
    const previewContext = preview.getContext('2d', { willReadFrequently: true })
    if (!previewContext) return [file as Blob]
    previewContext.drawImage(bitmap, 0, 0, preview.width, preview.height)
    const bounds = paperBounds(previewContext.getImageData(0, 0, preview.width, preview.height).data, preview.width, preview.height)
    const padding = 0.018
    const left = bounds ? Math.max(0, bounds.left / preview.width - padding) : 0
    const top = bounds ? Math.max(0, bounds.top / preview.height - padding) : 0
    const right = bounds ? Math.min(1, (bounds.right + 1) / preview.width + padding) : 1
    const bottom = bounds ? Math.min(1, (bounds.bottom + 1) / preview.height + padding) : 1
    const sourceX = Math.round(left * bitmap.width), sourceY = Math.round(top * bitmap.height)
    const sourceWidth = Math.max(1, Math.round((right - left) * bitmap.width)), sourceHeight = Math.max(1, Math.round((bottom - top) * bitmap.height))
    const targetWidth = Math.min(1800, Math.max(900, Math.round(sourceWidth * 1.25))), targetHeight = Math.round(sourceHeight * targetWidth / sourceWidth)
    const enhanced = document.createElement('canvas'); enhanced.width = targetWidth; enhanced.height = targetHeight
    const context = enhanced.getContext('2d', { willReadFrequently: true })
    if (!context) return [file as Blob]
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
    const image = context.getImageData(0, 0, targetWidth, targetHeight)
    for (let offset = 0; offset < image.data.length; offset += 4) {
      const gray = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
      const value = Math.max(0, Math.min(255, (gray - 128) * 1.48 + 154))
      image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value
    }
    context.putImageData(image, 0, 0)
    if (targetHeight / targetWidth < 2.35) return [await canvasBlob(enhanced)]
    const segmentHeight = Math.round(targetWidth * 1.65), overlap = Math.round(segmentHeight * 0.08)
    const images: Blob[] = []
    for (let y = 0; y < targetHeight; y += segmentHeight - overlap) {
      const height = Math.min(segmentHeight, targetHeight - y)
      if (height < targetWidth * 0.35) break
      const segment = document.createElement('canvas'); segment.width = targetWidth; segment.height = height
      segment.getContext('2d')?.drawImage(enhanced, 0, y, targetWidth, height, 0, 0, targetWidth, height)
      images.push(await canvasBlob(segment))
      if (y + height >= targetHeight) break
    }
    return images.length ? images : [await canvasBlob(enhanced)]
  } finally { bitmap.close() }
}

function mergeOcrText(parts: string[]) {
  const merged: string[] = []
  for (const part of parts) {
    const lines = part.split(/\r?\n/).map(normalizedLine).filter(Boolean)
    let overlap = 0
    for (let size = Math.min(6, merged.length, lines.length); size >= 2; size -= 1) {
      if (merged.slice(-size).map(normalizedKey).join('|') === lines.slice(0, size).map(normalizedKey).join('|')) { overlap = size; break }
    }
    merged.push(...lines.slice(overlap))
  }
  return merged.join('\n')
}

export async function scanReceiptImage(file: File, onProgress?: (progress: ReceiptScanProgress) => void, signal?: AbortSignal) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a receipt photo in JPG, PNG, or another image format.')
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is larger than 12 MB. Try a smaller photo.')
  if (signal?.aborted) throw new DOMException('Receipt scan cancelled.', 'AbortError')
  const { createWorker } = await import('tesseract.js')
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null, terminated = false
  const terminate = async () => { if (worker && !terminated) { terminated = true; await worker.terminate() } }
  const abort = () => { void terminate() }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    onProgress?.({ progress: 0.02, status: 'preparing receipt photo' })
    const images = await prepareReceiptImages(file).catch(() => [file as Blob])
    worker = await createWorker('eng', undefined, { logger: ({ progress, status }) => onProgress?.({ progress, status }) })
    const texts: string[] = [], confidences: number[] = []
    for (let index = 0; index < images.length; index += 1) {
      if (signal?.aborted) throw new DOMException('Receipt scan cancelled.', 'AbortError')
      const result = await worker.recognize(images[index], { rotateAuto: true })
      texts.push(result.data.text); confidences.push(result.data.confidence)
      onProgress?.({ progress: (index + 1) / images.length, status: `recognizing receipt section ${index + 1} of ${images.length}` })
    }
    const analysis = analyzeReceiptText(mergeOcrText(texts))
    const text = analysis.acceptedLines.join('\n'), reviewText = analysis.reviewLines.join('\n')
    if (!text && !reviewText) throw new Error('No ingredient lines were found. Try a brighter, straighter photo or enter the items manually.')
    return { text, reviewText, ignoredLines: analysis.ignoredLines, confidence: confidences.reduce((sum, value) => sum + value, 0) / Math.max(1, confidences.length) }
  } finally {
    signal?.removeEventListener('abort', abort)
    await terminate()
  }
}
