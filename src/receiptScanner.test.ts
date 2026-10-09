import { describe, expect, it } from 'vitest'
import { cleanReceiptText } from './receiptScanner'
import { parseSmartEntry } from './smartEntry'

describe('receipt text cleanup', () => {
  it('removes payment metadata and trailing prices', () => {
    const cleaned = cleanReceiptText(`
      FRESH MARKET
      555-123-4567
      10/09/2026
      2 CARTONS MILK        $7.98
      BABY SPINACH           3.49 F
      SUBTOTAL              11.47
      TAX                    0.00
      VISA                  11.47
      THANK YOU
    `)

    expect(cleaned).toBe('2 CARTONS MILK\nBABY SPINACH')
  })

  it('converts receipt multiplier notation to a leading quantity', () => {
    expect(cleanReceiptText('AVOCADO 4 @ $1.25 5.00')).toBe('4 AVOCADO')
  })

  it('deduplicates repeated OCR lines without changing their order', () => {
    expect(cleanReceiptText('MILK 3.99\nEggs 4.99\nMILK 3.99')).toBe('MILK\nEggs')
  })

  it('feeds cleaned OCR text into editable food suggestions', () => {
    const text = cleanReceiptText(`FRESH MARKET
123 MAIN STREET
555-123-4567
2 CARTONS MILK $7.98
BABY SPINACH $3.49
AVOCADO 4 @ $1.25 $5.00
1 LB SALMON $9.99
SUBTOTAL $26.46
TOTAL $26.46`)
    const items = parseSmartEntry(text)

    expect(items).toHaveLength(4)
    expect(items.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([
      { name: 'Milk', quantity: 2, unit: 'cartons' },
      { name: 'Baby Spinach', quantity: 1, unit: 'bag' },
      { name: 'Avocado', quantity: 4, unit: 'whole' },
      { name: 'Salmon', quantity: 1, unit: 'lb' },
    ])
  })
})
