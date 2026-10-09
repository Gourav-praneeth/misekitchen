export type ReceiptScanProgress = {
  progress: number
  status: string
}

const metadataLine = /^(?:subtotal|sub total|total|tax|sales tax|balance|amount due|change|cash|credit|debit|visa|mastercard|amex|payment|approved|authorization|auth(?:orization)? code|card|terminal|transaction|receipt|order|invoice|date|time|cashier|customer|member|loyalty|savings|discount|coupon|thank you|thanks|www\.|https?:|tel(?:ephone)?|phone)\b/i
const dateLine = /^(?:\d{1,2}[/-]){2}\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?$/i
const phoneLine = /^(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}$/
const addressLine = /^\d{1,6}\s+.+\b(?:st(?:reet)?|rd|road|ave(?:nue)?|blvd|boulevard|ln|lane|dr(?:ive)?|way)\b/i
const cityLine = /^[a-z .'-]+,\s*[a-z]{2}\s+\d{5}(?:-\d{4})?$/i

export function cleanReceiptText(rawText: string) {
  const seen = new Set<string>()
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim())
  return lines
    .filter((line) => line.length > 1 && /[a-z]/i.test(line))
    .filter((line, index) => {
      const storeHeader = index === 0 && [lines[1], lines[2]].some((next) => next && (addressLine.test(next) || phoneLine.test(next)))
      return !storeHeader && !metadataLine.test(line) && !dateLine.test(line) && !phoneLine.test(line) && !addressLine.test(line) && !cityLine.test(line)
    })
    .map((line) => {
      const multiplied = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*[x@]\s*\$?\d+(?:[.,]\d{2})\b/i)
      const itemLine = multiplied ? `${multiplied[2]} ${multiplied[1]}` : line
      return itemLine
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
        .replace(/^\d{5,}\s+/, '')
        .replace(/\s+(?:[$£€]\s*)?\d+[.,]\d{2}\s*[A-Z]?\s*$/i, '')
        .replace(/\s+(?:F|T|N)\s*$/i, '')
        .trim()
    })
    .filter((line) => {
      const key = line.toLowerCase()
      if (line.length < 2 || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n')
}

export async function scanReceiptImage(file: File, onProgress?: (progress: ReceiptScanProgress) => void, signal?: AbortSignal) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a receipt photo in JPG, PNG, or another image format.')
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is larger than 12 MB. Try a smaller photo.')
  if (signal?.aborted) throw new DOMException('Receipt scan cancelled.', 'AbortError')

  const { createWorker } = await import('tesseract.js')
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  let terminated = false
  const terminate = async () => {
    if (!worker || terminated) return
    terminated = true
    await worker.terminate()
  }
  const abort = () => { void terminate() }
  signal?.addEventListener('abort', abort, { once: true })

  try {
    worker = await createWorker('eng', undefined, {
      logger: ({ progress, status }) => onProgress?.({ progress, status }),
    })
    if (signal?.aborted) throw new DOMException('Receipt scan cancelled.', 'AbortError')
    const result = await worker.recognize(file, { rotateAuto: true })
    const text = cleanReceiptText(result.data.text)
    if (!text) throw new Error('No ingredient lines were found. Try a brighter, straighter photo or enter the items manually.')
    return { text, confidence: result.data.confidence }
  } finally {
    signal?.removeEventListener('abort', abort)
    await terminate()
  }
}
