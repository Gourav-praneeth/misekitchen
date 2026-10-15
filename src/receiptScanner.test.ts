import { describe, expect, it } from 'vitest'
import { analyzeReceiptText, cleanReceiptText } from './receiptScanner'
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

  it('combines repeated purchases into quantities without changing their order', () => {
    expect(cleanReceiptText('MILK 3.99\nEggs 4.99\nMILK 3.99')).toBe('2 MILK\nEggs')
  })

  it('parses sanitized Costco rows, discounts, duplicates, and non-food products', () => {
    const result = analyzeReceiptText(`
      COSTCO WHOLESALE
      123 Main Street
      Anytown, WA 00000
      C9 Member 000000000000
      ********Bottom of Basket********
      E 1987115 KSDIAPER SZ5 39.99 A
      E 1068080 PASTURE EGGS 8.79
      E 1068080 PASTURE EGGS 8.79
      E 2619 ORG BANANAS 2.49
      E 2619 ORG BANANAS 2.49
      E 1048072 GREEK YOGURT 7.49
      E 1048072 GREEK YOGURT 7.49
      E 1380620 ORGANIC OATS 9.99
      E 0000390307 / 1380620 2.50-
      E 121288 ORG BELLAS 5.99
      SUBTOTAL 99.99
      TAX 1.00
      TOTAL 100.99
    `)

    expect(result.acceptedLines).toEqual(['2 Eggs', '2 Bananas', '2 Greek yogurt', 'Rolled oats', 'Mushrooms'])
    expect(result.reviewLines).toEqual([])
    expect(result.ignoredLines.some((line) => /diaper/i.test(line))).toBe(true)
    expect(result.ignoredLines.some((line) => /390307/i.test(line))).toBe(true)
    expect(result.ignoredLines.some((line) => /member/i.test(line))).toBe(true)
  })

  it('keeps uncertain food-like rows for review instead of silently dropping them', () => {
    const result = analyzeReceiptText('E 1243237 KS KOMBUCHA 13.39 A\nE 1139639 KS TILAPIA 18.49\nAPPROVED - Purchase')
    expect(result.reviewLines).toEqual(['KS KOMBUCHA', 'KS TILAPIA'])
    expect(result.ignoredLines).toContain('APPROVED - Purchase')
  })

  it('ignores fuzzy store and basket headers while retaining readable unknown foods', () => {
    const result = analyzeReceiptText('COSRYCE\nwxxpooexx Bottom of Basketissssxmuxx\nE 1243237 KS KOMBUCHA 13.39 N ESE\nSa Ni Rtc Tn')
    expect(result.reviewLines).toEqual(['KS KOMBUCHA'])
    expect(result.ignoredLines).toEqual(expect.arrayContaining(['COSRYCE', 'wxxpooexx Bottom of Basketissssxmuxx', 'Sa Ni Rtc Tn']))
  })

  it('normalizes frequent OCR substitutions found in photographed Costco receipts', () => {
    const result = analyzeReceiptText('E 61576 SWEET PPTATO 6.99\nE 7812 YELLOW PNION 4.79\nE 2619 ORG BENANAS 2.49\nE 289660 COTWRGE CHSE 5.99\nE 512447 DAVEES 21 WG 9.59\nE 1048072 GRER YOGURT 7.49')
    expect(result.acceptedLines).toEqual(['Sweet potatoes', 'Onions', 'Bananas', 'Cottage cheese', 'Bread', 'Greek yogurt'])
    expect(result.reviewLines).toEqual([])
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
