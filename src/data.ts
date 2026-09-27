import type { InventoryItem, Recipe } from './types'

export const seedInventory: InventoryItem[] = [
  { id: 'chicken', name: 'Chicken breast', emoji: '🍗', quantity: 2.5, unit: 'lb', category: 'Protein', location: 'Fridge', expiresIn: 2 },
  { id: 'eggs', name: 'Eggs', emoji: '🥚', quantity: 8, unit: 'eggs', category: 'Protein', location: 'Fridge', expiresIn: 12 },
  { id: 'spinach', name: 'Baby spinach', emoji: '🥬', quantity: 1, unit: 'bag', category: 'Produce', location: 'Fridge', expiresIn: 1 },
  { id: 'carrots', name: 'Carrots', emoji: '🥕', quantity: 5, unit: 'whole', category: 'Produce', location: 'Fridge', expiresIn: 8 },
  { id: 'peas', name: 'Frozen peas', emoji: '🫛', quantity: 1, unit: 'bag', category: 'Produce', location: 'Freezer', expiresIn: 90 },
  { id: 'blueberries', name: 'Blueberries', emoji: '🫐', quantity: 1, unit: 'box', category: 'Produce', location: 'Fridge', expiresIn: 3 },
  { id: 'quinoa', name: 'Quinoa', emoji: '🌾', quantity: 2, unit: 'cups', category: 'Pantry', location: 'Pantry', expiresIn: 120 },
  { id: 'oats', name: 'Rolled oats', emoji: '🥣', quantity: 4, unit: 'cups', category: 'Pantry', location: 'Pantry', expiresIn: 90 },
  { id: 'yogurt', name: 'Greek yogurt', emoji: '🥛', quantity: 3, unit: 'cups', category: 'Dairy', location: 'Fridge', expiresIn: 6 },
]

export const recipes: Recipe[] = [
  {
    id: 'chicken-quinoa', name: 'Golden chicken quinoa bowl', emoji: '🥗',
    description: 'Herby quinoa, caramelized carrots, greens, and bright lemon yogurt.',
    time: 25, servings: 4, protein: 44, accent: '#d8905d',
    ingredients: [
      { name: 'Chicken breast', amount: 1.5, unit: 'lb' }, { name: 'Quinoa', amount: 1, unit: 'cups' },
      { name: 'Carrots', amount: 3, unit: 'whole' }, { name: 'Greek yogurt', amount: 1, unit: 'cups' },
    ],
  },
  {
    id: 'spinach-chicken', name: 'Skillet chicken & spinach', emoji: '🍳',
    description: 'A one-pan dinner that rescues tonight’s most time-sensitive ingredients.',
    time: 20, servings: 3, protein: 41, accent: '#678669',
    ingredients: [
      { name: 'Chicken breast', amount: 1, unit: 'lb' }, { name: 'Baby spinach', amount: 1, unit: 'bag' },
      { name: 'Greek yogurt', amount: 1, unit: 'cups' },
    ],
  },
  {
    id: 'berry-oats', name: 'Blueberry overnight oats', emoji: '🫐',
    description: 'Creamy, gently sweet, and ready before the morning starts.',
    time: 5, servings: 2, protein: 18, accent: '#7273a8',
    ingredients: [
      { name: 'Rolled oats', amount: 1, unit: 'cups' }, { name: 'Blueberries', amount: 1, unit: 'box' },
      { name: 'Greek yogurt', amount: 1, unit: 'cups' },
    ],
  },
  {
    id: 'fried-quinoa', name: 'Garden fried quinoa', emoji: '🥘',
    description: 'A fast, pantry-friendly skillet with vegetables and a jammy egg.',
    time: 18, servings: 3, protein: 24, accent: '#bf9c50',
    ingredients: [
      { name: 'Quinoa', amount: 1.5, unit: 'cups' }, { name: 'Eggs', amount: 3, unit: 'eggs' },
      { name: 'Carrots', amount: 2, unit: 'whole' }, { name: 'Frozen peas', amount: 1, unit: 'bag' },
      { name: 'Soy sauce', amount: 1, unit: 'bottle' },
    ],
  },
]
