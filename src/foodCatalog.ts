import type { Category, Location } from './types'

export type FoodProfile = {
  id: string
  name: string
  aliases: string[]
  emoji: string
  category: Category
  location: Location
  shelfLifeDays: number | null
  defaultUnit: string
}

export type FoodIntelligence = {
  profile: FoodProfile
  matchedAlias: string
  score: number
}

type FoodRow = [name: string, aliases: string, emoji: string, category: Category, location: Location, shelfLifeDays: number | null, defaultUnit: string]

// This catalog intentionally contains generic foods rather than brands. It runs entirely
// in the browser, so suggestions stay fast, private, and available offline.
const rows: FoodRow[] = [
  ['Chicken breast', 'chicken breasts|chicken brst|chkn brst|boneless chicken breast|boneless skinless chicken breast|bnls sknls chkn brst', '🍗', 'Protein', 'Fridge', 3, 'lb'],
  ['Chicken thighs', 'chicken thigh|chkn thighs|boneless chicken thighs', '🍗', 'Protein', 'Fridge', 3, 'lb'],
  ['Ground turkey', 'turkey mince|ground trky', '🍗', 'Protein', 'Fridge', 2, 'lb'],
  ['Ground beef', 'beef mince|ground bf|hamburger meat', '🥩', 'Protein', 'Fridge', 2, 'lb'],
  ['Steak', 'beef steak|sirloin|ribeye|new york strip', '🥩', 'Protein', 'Fridge', 3, 'lb'],
  ['Pork chops', 'pork chop|boneless pork chops', '🥩', 'Protein', 'Fridge', 3, 'lb'],
  ['Bacon', 'pork bacon', '🥓', 'Protein', 'Fridge', 7, 'pack'],
  ['Salmon', 'salmon fillet|salmon filet|atlantic salmon', '🐟', 'Protein', 'Fridge', 2, 'lb'],
  ['Tuna', 'tuna steak|canned tuna', '🐟', 'Protein', 'Pantry', 180, 'can'],
  ['Shrimp', 'prawns|raw shrimp', '🍤', 'Protein', 'Fridge', 2, 'lb'],
  ['Eggs', 'egg|large eggs|dozen eggs', '🥚', 'Protein', 'Fridge', 21, 'eggs'],
  ['Tofu', 'firm tofu|extra firm tofu', '🧊', 'Protein', 'Fridge', 7, 'pack'],
  ['Tempeh', 'soy tempeh', '🧊', 'Protein', 'Fridge', 7, 'pack'],

  ['Baby spinach', 'baby spnch|spinach baby', '🥬', 'Produce', 'Fridge', 4, 'bag'],
  ['Spinach', 'spnch|fresh spinach', '🥬', 'Produce', 'Fridge', 4, 'bag'],
  ['Lettuce', 'romaine|romaine hearts|iceberg lettuce|lettuce head', '🥬', 'Produce', 'Fridge', 7, 'head'],
  ['Kale', 'curly kale|baby kale', '🥬', 'Produce', 'Fridge', 5, 'bunch'],
  ['Broccoli', 'broccoli crowns|broccoli florets|broc crowns', '🥦', 'Produce', 'Fridge', 6, 'head'],
  ['Carrots', 'carrot|baby carrots', '🥕', 'Produce', 'Fridge', 21, 'whole'],
  ['Avocado', 'avocados|avdo|avocados bag', '🥑', 'Produce', 'Pantry', 5, 'whole'],
  ['Tomatoes', 'tomato|roma tomatoes|tomato on vine|grape tomatoes|cherry tomatoes', '🍅', 'Produce', 'Fridge', 7, 'whole'],
  ['Cucumber', 'cucumbers|english cucumber', '🥒', 'Produce', 'Fridge', 7, 'whole'],
  ['Bell peppers', 'bell pepper|green pepper|red pepper|yellow pepper|sweet peppers', '🫑', 'Produce', 'Fridge', 7, 'whole'],
  ['Zucchini', 'courgette|zucchinis', '🥒', 'Produce', 'Fridge', 7, 'whole'],
  ['Asparagus', 'asparagus bunch', '🥬', 'Produce', 'Fridge', 4, 'bunch'],
  ['Green beans', 'string beans|green bean', '🫛', 'Produce', 'Fridge', 7, 'bag'],
  ['Corn', 'sweet corn|corn cob|corn on the cob', '🌽', 'Produce', 'Fridge', 5, 'whole'],
  ['Peas', 'green peas|frozen peas', '🫛', 'Produce', 'Freezer', 90, 'bag'],
  ['Apples', 'apple|gala apples|fuji apples|honeycrisp apples', '🍎', 'Produce', 'Fridge', 21, 'whole'],
  ['Bananas', 'banana|bnna', '🍌', 'Produce', 'Pantry', 5, 'whole'],
  ['Blueberries', 'blueberry|blue berries|blueb|bluberries', '🫐', 'Produce', 'Fridge', 5, 'box'],
  ['Strawberries', 'strawberry|strawb|straw berries', '🍓', 'Produce', 'Fridge', 4, 'box'],
  ['Raspberries', 'raspberry|rasp berries', '🫐', 'Produce', 'Fridge', 3, 'box'],
  ['Grapes', 'grape|red grapes|green grapes', '🍇', 'Produce', 'Fridge', 10, 'bag'],
  ['Lemons', 'lemon', '🍋', 'Produce', 'Fridge', 21, 'whole'],
  ['Limes', 'lime', '🍋', 'Produce', 'Fridge', 21, 'whole'],
  ['Oranges', 'orange|navel oranges|clementines|mandarins', '🍊', 'Produce', 'Fridge', 18, 'whole'],
  ['Onions', 'onion|yellow onion|red onion|white onion|shallots', '🧅', 'Produce', 'Pantry', 30, 'whole'],
  ['Garlic', 'garlic bulb|fresh garlic', '🧄', 'Produce', 'Pantry', 30, 'bulb'],
  ['Potatoes', 'potato|russet potatoes|gold potatoes|red potatoes', '🥔', 'Produce', 'Pantry', 21, 'whole'],
  ['Sweet potatoes', 'sweet potato|yams', '🍠', 'Produce', 'Pantry', 21, 'whole'],
  ['Mushrooms', 'mushroom|white mushrooms|cremini mushrooms|baby bella mushrooms', '🍄', 'Produce', 'Fridge', 6, 'pack'],
  ['Cilantro', 'coriander|fresh cilantro', '🌿', 'Produce', 'Fridge', 7, 'bunch'],
  ['Parsley', 'fresh parsley', '🌿', 'Produce', 'Fridge', 7, 'bunch'],

  ['Milk', 'whole milk|skim milk|2 percent milk|2pct milk|org milk|organic milk|mlk', '🥛', 'Dairy', 'Fridge', 7, 'carton'],
  ['Oat milk', 'oatmilk|oat beverage', '🥛', 'Dairy', 'Fridge', 10, 'carton'],
  ['Almond milk', 'almondmilk|almond beverage', '🥛', 'Dairy', 'Fridge', 10, 'carton'],
  ['Greek yogurt', 'greek ygt|grk yogurt|grk ygt', '🥛', 'Dairy', 'Fridge', 10, 'cups'],
  ['Yogurt', 'yoghurt|ygt|plain yogurt|vanilla yogurt', '🥛', 'Dairy', 'Fridge', 10, 'cups'],
  ['Cheddar cheese', 'cheddar|shredded cheddar|ched cheese', '🧀', 'Dairy', 'Fridge', 21, 'pack'],
  ['Mozzarella', 'mozzarella cheese|mozz cheese|fresh mozzarella', '🧀', 'Dairy', 'Fridge', 14, 'pack'],
  ['Cream cheese', 'crm cheese', '🧀', 'Dairy', 'Fridge', 14, 'pack'],
  ['Butter', 'salted butter|unsalted butter', '🧈', 'Dairy', 'Fridge', 60, 'pack'],

  ['Rolled oats', 'oats|old fashioned oats|rolled oat|oatmeal', '🥣', 'Pantry', 'Pantry', 180, 'cups'],
  ['Rice', 'white rice|brown rice|basmati rice|jasmine rice', '🍚', 'Pantry', 'Pantry', 365, 'cups'],
  ['Quinoa', 'quinoa grain', '🌾', 'Pantry', 'Pantry', 365, 'cups'],
  ['Bread', 'sandwich bread|whole wheat bread|white bread', '🍞', 'Pantry', 'Pantry', 6, 'loaf'],
  ['Tortillas', 'tortilla|flour tortillas|corn tortillas', '🫓', 'Pantry', 'Pantry', 21, 'pack'],
  ['Pasta', 'spaghetti|penne|macaroni|noodles|dry pasta', '🍝', 'Pantry', 'Pantry', 365, 'box'],
  ['Black beans', 'black bean|canned black beans', '🥫', 'Pantry', 'Pantry', 365, 'can'],
  ['Chickpeas', 'chickpea|garbanzo beans|garbanzo bean', '🥫', 'Pantry', 'Pantry', 365, 'can'],
  ['Lentils', 'lentil|green lentils|red lentils', '🥫', 'Pantry', 'Pantry', 365, 'bag'],
  ['Peanut butter', 'pb|creamy peanut butter|crunchy peanut butter', '🥜', 'Pantry', 'Pantry', 120, 'jar'],
  ['Olive oil', 'extra virgin olive oil|evoo|oliveoil', '🫒', 'Pantry', 'Pantry', 365, 'bottle'],
  ['Flour', 'all purpose flour|ap flour|wheat flour', '🌾', 'Pantry', 'Pantry', 180, 'bag'],
  ['Sugar', 'white sugar|granulated sugar|brown sugar', '🧂', 'Pantry', 'Pantry', 365, 'bag'],
  ['Cereal', 'breakfast cereal', '🥣', 'Pantry', 'Pantry', 120, 'box'],
  ['Coffee', 'ground coffee|coffee beans', '☕', 'Pantry', 'Pantry', 120, 'bag'],
  ['Tomato sauce', 'pasta sauce|marinara|tom sauce', '🥫', 'Pantry', 'Pantry', 365, 'jar'],
  ['Chicken broth', 'chicken stock|chkn broth|chkn stock', '🥫', 'Pantry', 'Pantry', 365, 'carton'],
  ['Soy sauce', 'soya sauce', '🥫', 'Pantry', 'Pantry', 365, 'bottle'],
]

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const foodCatalog: FoodProfile[] = rows.map(([name, aliases, emoji, category, location, shelfLifeDays, defaultUnit]) => ({
  id: slug(name), name, aliases: aliases.split('|'), emoji, category, location, shelfLifeDays, defaultUnit,
}))

const tokenAliases: Record<string, string> = {
  bnls: 'boneless', sknls: 'skinless', chkn: 'chicken', chknbrst: 'chicken breast', brst: 'breast',
  trky: 'turkey', org: 'organic', mlk: 'milk', ygt: 'yogurt', grk: 'greek', avdo: 'avocado',
  spnch: 'spinach', broc: 'broccoli', strawb: 'strawberry', blueb: 'blueberry', fzn: 'frozen',
  frzn: 'frozen', whl: 'whole', grd: 'ground', mozz: 'mozzarella', chz: 'cheese', crm: 'cream',
  veg: 'vegetable', veggies: 'vegetables', dz: 'dozen', pkg: 'pack', ct: 'count',
}

const noiseWords = new Set(['organic', 'fresh', 'natural', 'premium', 'select', 'brand', 'large', 'medium', 'small', 'family', 'value', 'pack'])

export function normalizeCatalogText(value: string) {
  return value.toLowerCase()
    .replace(/[%]/g, ' percent ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .flatMap((token) => (tokenAliases[token] || token).split(' '))
    .filter((token) => token && !noiseWords.has(token))
    .join(' ')
}

function containsPhrase(haystack: string, needle: string) {
  return ` ${haystack} `.includes(` ${needle} `)
}

export function getFoodIntelligence(value: string): FoodIntelligence | null {
  const input = normalizeCatalogText(value)
  if (!input) return null
  let best: FoodIntelligence | null = null

  for (const profile of foodCatalog) {
    for (const candidate of [profile.name, ...profile.aliases]) {
      const alias = normalizeCatalogText(candidate)
      if (!alias) continue
      let score = 0
      if (input === alias) score = 1
      else if (containsPhrase(input, alias)) score = 0.86 + Math.min(alias.split(' ').length * 0.025, 0.1)
      else if (containsPhrase(alias, input) && input.split(' ').length > 1) score = 0.78
      if (score && (!best || score > best.score || (score === best.score && alias.length > best.matchedAlias.length))) {
        best = { profile, matchedAlias: candidate, score }
      }
    }
  }
  return best
}

export function canonicalFoodName(value: string) {
  return getFoodIntelligence(value)?.profile.name.toLowerCase() || normalizeCatalogText(value)
}
