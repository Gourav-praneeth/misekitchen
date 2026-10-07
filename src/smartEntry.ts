import type { Category, InventoryItem, Location } from './types'

type FoodHint = {
  words: string[]
  emoji: string
  category: Category
  location: Location
  expiresIn: number | null
  defaultUnit: string
}

const hints: FoodHint[] = [
  { words: ['chicken', 'turkey'], emoji: '🍗', category: 'Protein', location: 'Fridge', expiresIn: 3, defaultUnit: 'lb' },
  { words: ['beef', 'steak', 'pork'], emoji: '🥩', category: 'Protein', location: 'Fridge', expiresIn: 3, defaultUnit: 'lb' },
  { words: ['salmon', 'fish', 'tuna'], emoji: '🐟', category: 'Protein', location: 'Fridge', expiresIn: 2, defaultUnit: 'lb' },
  { words: ['egg'], emoji: '🥚', category: 'Protein', location: 'Fridge', expiresIn: 21, defaultUnit: 'eggs' },
  { words: ['spinach', 'lettuce', 'kale', 'greens'], emoji: '🥬', category: 'Produce', location: 'Fridge', expiresIn: 4, defaultUnit: 'bag' },
  { words: ['broccoli'], emoji: '🥦', category: 'Produce', location: 'Fridge', expiresIn: 6, defaultUnit: 'head' },
  { words: ['carrot'], emoji: '🥕', category: 'Produce', location: 'Fridge', expiresIn: 14, defaultUnit: 'whole' },
  { words: ['avocado'], emoji: '🥑', category: 'Produce', location: 'Fridge', expiresIn: 4, defaultUnit: 'whole' },
  { words: ['tomato'], emoji: '🍅', category: 'Produce', location: 'Fridge', expiresIn: 7, defaultUnit: 'whole' },
  { words: ['corn'], emoji: '🌽', category: 'Produce', location: 'Freezer', expiresIn: 60, defaultUnit: 'bag' },
  { words: ['peas'], emoji: '🫛', category: 'Produce', location: 'Freezer', expiresIn: 60, defaultUnit: 'bag' },
  { words: ['apple'], emoji: '🍎', category: 'Produce', location: 'Fridge', expiresIn: 21, defaultUnit: 'whole' },
  { words: ['banana'], emoji: '🍌', category: 'Produce', location: 'Pantry', expiresIn: 5, defaultUnit: 'whole' },
  { words: ['blueberr'], emoji: '🫐', category: 'Produce', location: 'Fridge', expiresIn: 5, defaultUnit: 'box' },
  { words: ['strawberr'], emoji: '🍓', category: 'Produce', location: 'Fridge', expiresIn: 4, defaultUnit: 'box' },
  { words: ['lemon', 'lime'], emoji: '🍋', category: 'Produce', location: 'Fridge', expiresIn: 21, defaultUnit: 'whole' },
  { words: ['orange', 'clementine'], emoji: '🍊', category: 'Produce', location: 'Fridge', expiresIn: 18, defaultUnit: 'whole' },
  { words: ['onion', 'shallot'], emoji: '🧅', category: 'Produce', location: 'Pantry', expiresIn: 30, defaultUnit: 'whole' },
  { words: ['garlic'], emoji: '🧄', category: 'Produce', location: 'Pantry', expiresIn: 30, defaultUnit: 'bulb' },
  { words: ['potato'], emoji: '🥔', category: 'Produce', location: 'Pantry', expiresIn: 21, defaultUnit: 'whole' },
  { words: ['mushroom'], emoji: '🍄', category: 'Produce', location: 'Fridge', expiresIn: 6, defaultUnit: 'pack' },
  { words: ['milk'], emoji: '🥛', category: 'Dairy', location: 'Fridge', expiresIn: 7, defaultUnit: 'carton' },
  { words: ['yogurt'], emoji: '🥛', category: 'Dairy', location: 'Fridge', expiresIn: 10, defaultUnit: 'cups' },
  { words: ['cheese'], emoji: '🧀', category: 'Dairy', location: 'Fridge', expiresIn: 21, defaultUnit: 'pack' },
  { words: ['butter'], emoji: '🧈', category: 'Dairy', location: 'Fridge', expiresIn: 60, defaultUnit: 'pack' },
  { words: ['oat'], emoji: '🥣', category: 'Pantry', location: 'Pantry', expiresIn: 120, defaultUnit: 'cups' },
  { words: ['rice'], emoji: '🍚', category: 'Pantry', location: 'Pantry', expiresIn: 180, defaultUnit: 'cups' },
  { words: ['quinoa', 'grain'], emoji: '🌾', category: 'Pantry', location: 'Pantry', expiresIn: 180, defaultUnit: 'cups' },
  { words: ['bread'], emoji: '🍞', category: 'Pantry', location: 'Pantry', expiresIn: 6, defaultUnit: 'loaf' },
  { words: ['pasta', 'noodle'], emoji: '🍝', category: 'Pantry', location: 'Pantry', expiresIn: 180, defaultUnit: 'box' },
  { words: ['bean', 'chickpea', 'lentil'], emoji: '🥫', category: 'Pantry', location: 'Pantry', expiresIn: 180, defaultUnit: 'can' },
  { words: ['tofu', 'tempeh'], emoji: '🧊', category: 'Protein', location: 'Fridge', expiresIn: 7, defaultUnit: 'pack' },
]

const numberWords: Record<string, number> = { a: 1, an: 1, half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12 }
const unitAliases: Record<string, string> = { pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb', ounce: 'oz', ounces: 'oz', oz: 'oz', cup: 'cups', cups: 'cups', bag: 'bag', bags: 'bags', box: 'box', boxes: 'boxes', carton: 'carton', cartons: 'cartons', bottle: 'bottle', bottles: 'bottles', can: 'can', cans: 'cans', pack: 'pack', packs: 'packs', package: 'pack', packages: 'packs', bunch: 'bunch', bunches: 'bunches', loaf: 'loaf', loaves: 'loaves', egg: 'eggs', eggs: 'eggs' }

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function findHint(name: string): FoodHint {
  const lower = name.toLowerCase()
  return hints.find((hint) => hint.words.some((word) => lower.includes(word))) || {
    words: [], emoji: '🥫', category: 'Other', location: 'Pantry', expiresIn: null, defaultUnit: 'item',
  }
}

export function parseSmartEntry(input: string): InventoryItem[] {
  const normalized = input
    .replace(/\b(and|plus)\b/gi, ',')
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  return normalized.map((part, index) => {
    const clean = part.replace(/^(i (bought|have|got)|add|some)\s+/i, '').trim()
    const match = clean.match(/^(\d+\/\d+|\d+(?:\.\d+)?|a|an|half|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)?\s*(lb|lbs|pounds?|oz|ounces?|cups?|bags?|boxes?|cartons?|bottles?|cans?|packs?|packages?|bunch(?:es)?|loaf|loaves|eggs?)?\s*(?:of\s+)?(.+)$/i)
    const rawAmount = match?.[1]?.toLowerCase()
    const fraction = rawAmount?.match(/^(\d+)\/(\d+)$/)
    const quantity = fraction ? Number(fraction[1]) / Number(fraction[2]) : rawAmount ? (Number(rawAmount) || numberWords[rawAmount] || 1) : 1
    const rawUnit = match?.[2]?.toLowerCase()
    let rawName = (match?.[3] || clean)
      .replace(/^(?:fresh|frozen|organic)\s+/i, '')
      .replace(/\s+(?:please|today)$/i, '')
      .replace(/^(?:of\s+|the\s+)/i, '')
      .trim()
    if (rawUnit?.startsWith('egg') && rawName.toLowerCase() === 's') rawName = 'eggs'
    const hint = findHint(rawName)
    const unit = rawUnit ? (unitAliases[rawUnit] || rawUnit) : hint.defaultUnit
    return {
      id: `smart-${Date.now()}-${index}`,
      name: titleCase(rawName),
      emoji: hint.emoji,
      quantity,
      unit,
      category: hint.category,
      location: hint.location,
      expiresIn: hint.expiresIn,
    }
  })
}
