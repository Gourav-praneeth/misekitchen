import type { Category, InventoryItem, Location } from './types'
import { canonicalFoodName, getFoodIntelligence } from './foodCatalog'

export type SmartEntryConfidence = 'high' | 'medium' | 'low'
export type SmartEntryItem = InventoryItem & {
  confidence: SmartEntryConfidence
  explanation: string
  source: string
}

const numberWords: Record<string, number> = { a: 1, an: 1, half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12 }
const unitAliases: Record<string, string> = {
  pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb', kilogram: 'kg', kilograms: 'kg', kgs: 'kg', kg: 'kg',
  gram: 'g', grams: 'g', g: 'g', ounce: 'oz', ounces: 'oz', oz: 'oz', liter: 'L', liters: 'L', litre: 'L', litres: 'L', l: 'L',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml', gallon: 'gallon', gallons: 'gallons',
  cup: 'cups', cups: 'cups', bag: 'bag', bags: 'bags', box: 'box', boxes: 'boxes', carton: 'carton', cartons: 'cartons',
  bottle: 'bottle', bottles: 'bottles', can: 'can', cans: 'cans', jar: 'jar', jars: 'jars', pack: 'pack', packs: 'packs',
  package: 'pack', packages: 'packs', bunch: 'bunch', bunches: 'bunches', head: 'head', heads: 'heads', bulb: 'bulb', bulbs: 'bulbs',
  loaf: 'loaf', loaves: 'loaves', egg: 'eggs', eggs: 'eggs', item: 'item', items: 'items', piece: 'piece', pieces: 'pieces',
}
const numberPattern = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|\\b(?:a|an|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\\b)'
const unitPattern = Object.keys(unitAliases).sort((a, b) => b.length - a.length).join('|')

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hintFor(name: string) {
  const intelligence = getFoodIntelligence(name)
  return {
    recognized: Boolean(intelligence),
    intelligence,
    hint: intelligence ? {
      emoji: intelligence.profile.emoji,
      category: intelligence.profile.category,
      location: intelligence.profile.location,
      expiresIn: intelligence.profile.shelfLifeDays,
      defaultUnit: intelligence.profile.defaultUnit,
    } : { emoji: '🥫', category: 'Other' as Category, location: 'Pantry' as Location, expiresIn: null, defaultUnit: 'item' },
  }
}

function parseAmount(rawAmount?: string) {
  if (!rawAmount) return 1
  const lower = rawAmount.toLowerCase().trim()
  const mixed = lower.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const fraction = lower.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  return Number(lower) || numberWords[lower] || 1
}

function cleanReceiptLine(value: string) {
  return value
    .replace(/^\s*(?:[-*•]|\[.?\]|\d+[.)])\s*/, '')
    .replace(/^\d{5,}\s+/, '')
    .replace(/\s+\$\d+(?:\.\d{2})?\s*$/, '')
    .trim()
}

function splitEntries(input: string) {
  const initial = input.split(/[,;\n]+/).map(cleanReceiptLine).filter(Boolean)
  return initial.flatMap((part) => {
    const connector = part.match(/^(.*?)\s+(?:and|plus|&)\s+(.+)$/i)
    if (!connector) return [part]
    const prefix = new RegExp(`^${numberPattern}\\s+(?:(?:${unitPattern})\\b\\s*)?(?:of\\s+)?`, 'i')
    const left = connector[1].replace(prefix, '')
    const right = connector[2].replace(prefix, '')
    return hintFor(left).recognized && hintFor(right).recognized ? [connector[1], connector[2]] : [part]
  })
}

function dateFromText(value: string) {
  return value.match(/\b(?:use by|best before|expires?)(?:\s+on)?\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1] || null
}

function daysFromText(value: string) {
  if (/\b(?:use|eat)\s+tomorrow\b/i.test(value)) return 1
  const relative = value.match(/\b(?:use|eat|expires?|best)\s+(?:within|in)\s+(\d+)\s+days?\b/i)
  return relative ? Number(relative[1]) : null
}

export function normalizeFoodName(value: string) {
  return canonicalFoodName(value)
    .replace(/\bbaby\s+/g, '')
    .replace(/\bbreasts\b/g, 'breast')
    .replace(/\bberries\b/g, 'berry')
    .replace(/\beggs\b/g, 'egg')
    .replace(/\btomatoes\b/g, 'tomato')
    .replace(/\bpotatoes\b/g, 'potato')
    .replace(/\s+/g, ' ')
}

export function sameFoodAndUnit(left: Pick<InventoryItem, 'name' | 'unit'>, right: Pick<InventoryItem, 'name' | 'unit'>) {
  const leftUnit = unitAliases[left.unit.toLowerCase()] || left.unit.toLowerCase()
  const rightUnit = unitAliases[right.unit.toLowerCase()] || right.unit.toLowerCase()
  return normalizeFoodName(left.name) === normalizeFoodName(right.name) && leftUnit === rightUnit
}

export function parseSmartEntry(input: string): SmartEntryItem[] {
  return splitEntries(input).map((source, index) => {
    const explicitDate = dateFromText(source)
    const explicitDays = daysFromText(source)
    const locationOverride: Location | null = /\b(?:frozen|freezer|keep frozen)\b/i.test(source) ? 'Freezer'
      : /\b(?:pantry|shelf stable)\b/i.test(source) ? 'Pantry'
        : /\bfridge\b/i.test(source) ? 'Fridge' : null
    let clean = source
      .replace(/^(?:i\s+(?:bought|have|got)|add|some)\s+/i, '')
      .replace(/\b(?:use by|best before|expires?)(?:\s+on)?\s+\d{4}-\d{2}-\d{2}\b/gi, '')
      .replace(/\b(?:use|eat|expires?|best)\s+(?:within|in)\s+\d+\s+days?\b/gi, '')
      .replace(/\b(?:use|eat)\s+tomorrow\b/gi, '')
      .replace(/\b(?:keep\s+frozen|in\s+(?:the\s+)?(?:fridge|freezer|pantry)|shelf\s+stable)\b/gi, '')
      .trim()
    const suffixAmount = clean.match(/\s+[x×](\d+(?:\.\d+)?)$/i)
    if (suffixAmount) clean = clean.slice(0, suffixAmount.index).trim()
    const match = clean.match(new RegExp(`^(${numberPattern})(?:\\s*(${unitPattern})\\b)?\\s*(?:of\\s+)?(.+)$`, 'i'))
    const rawAmount = match?.[1]
    const rawUnit = match?.[2]?.toLowerCase()
    let rawName = (match?.[3] || clean)
      .replace(/^(?:fresh|frozen|organic|canned)\s+/i, '')
      .replace(/\s+(?:please|today)$/i, '')
      .replace(/^(?:of\s+|the\s+)/i, '')
      .trim()
    if (rawUnit?.startsWith('egg') && rawName.toLowerCase() === 's') rawName = 'eggs'
    const { hint, recognized, intelligence } = hintFor(rawName)
    const quantity = suffixAmount ? Number(suffixAmount[1]) : parseAmount(rawAmount)
    const unit = rawUnit ? (unitAliases[rawUnit] || rawUnit) : hint.defaultUnit
    const location = locationOverride || hint.location
    const expiresIn = explicitDays ?? (locationOverride === 'Freezer' && hint.expiresIn !== null ? Math.max(60, hint.expiresIn) : hint.expiresIn)
    const confidence: SmartEntryConfidence = !recognized ? 'low' : intelligence!.score < 0.85 ? 'medium' : rawAmount || suffixAmount ? 'high' : 'medium'
    const displayName = intelligence ? titleCase(intelligence.profile.name) : titleCase(rawName)
    const explanation = !recognized ? 'Check category, storage, and icon'
      : locationOverride ? `${displayName} recognized · ${location} storage`
        : `${displayName} recognized · ${location} · about ${expiresIn ?? '—'} days`
    return {
      id: `smart-${Date.now()}-${index}`,
      name: displayName,
      emoji: hint.emoji,
      quantity,
      unit,
      category: hint.category,
      location,
      expiresIn,
      expiresOn: explicitDate,
      confidence,
      explanation,
      source,
    }
  }).filter((item) => item.name)
}
