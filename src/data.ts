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
    id: 'mise-overnight-oats', name: 'Overnight oats', emoji: '🥣', source: 'mise',
    description: 'A fiber-rich, protein-packed breakfast with warming spices and crunchy nuts.',
    time: 10, servings: 1, protein: 35, accent: '#7273a8',
    ingredients: [
      { name: 'Rolled oats', amount: 1 / 3, unit: 'cups' },
      { name: 'Milled flax seeds', amount: 2, unit: 'tbsp' },
      { name: 'Chia seeds', amount: 1, unit: 'tbsp' },
      { name: 'Hemp seeds', amount: 1, unit: 'tbsp' },
      { name: 'Cocoa powder', amount: 1, unit: 'tbsp' },
      { name: 'Cinnamon', amount: 1 / 2, unit: 'tsp' },
      { name: 'Turmeric', amount: 1 / 4, unit: 'tsp' },
      { name: 'Protein powder', amount: 2, unit: 'tbsp' },
      { name: 'Milk', amount: 2 / 3, unit: 'cups' },
      { name: 'Almonds', amount: 6, unit: 'almonds' },
      { name: 'Pecans', amount: 2, unit: 'pecans' },
      { name: 'Walnuts', amount: 4, unit: 'walnuts' },
    ],
    instructions: [
      'Combine the oats, flax, chia, hemp, cocoa, cinnamon, turmeric, and protein powder in a jar.',
      'Stir in the milk until no dry pockets remain.',
      'Cover and refrigerate overnight, or for at least 6 hours.',
      'Top with the almonds, pecans, and walnuts before serving.',
    ],
  },
  {
    id: 'mise-chicken-salad-meal-prep', name: 'Chicken salad meal prep', emoji: '🥗', source: 'mise',
    description: 'A bright, high-protein chicken salad with crisp vegetables and a creamy cottage-cheese dressing.',
    time: 40, servings: 12, protein: 22, accent: '#678669',
    ingredients: [
      { name: 'Cooked shredded chicken', amount: 600, unit: 'g' },
      { name: 'Celery', amount: 336, unit: 'g' },
      { name: 'Red onion', amount: 225, unit: 'g' },
      { name: 'Grapes', amount: 441, unit: 'g' },
      { name: 'Mini sweet bell peppers', amount: 105, unit: 'g' },
      { name: 'Green onions', amount: 45, unit: 'g' },
      { name: 'Low-fat cottage cheese', amount: 357, unit: 'g' },
      { name: 'Non-fat Greek yogurt', amount: 180, unit: 'g' },
      { name: 'Grainy Dijon mustard', amount: 2, unit: 'tbsp' },
      { name: 'Fresh parsley', amount: 3 / 4, unit: 'cups' },
      { name: 'Kosher salt', amount: 1.5, unit: 'tsp' },
      { name: 'Black pepper', amount: 3 / 8, unit: 'tsp' },
      { name: 'Fresh lemon juice', amount: 3, unit: 'tbsp' },
    ],
    instructions: [
      'If cooking the chicken, gently simmer it with 1/2 tsp thyme, 1/2 tsp peppercorns, turmeric, chopped onion, celery, grated ginger, 2–3 garlic cloves, a bay leaf, parsley or cilantro, and 1 carrot. Reduce to a low simmer and cook until the center reaches 165°F.',
      'Cool the chicken, then shred it. Rotisserie chicken can be used instead.',
      'Finely chop the celery, red onion, grapes, sweet peppers, green onions, and parsley.',
      'Blend or stir the cottage cheese, Greek yogurt, Dijon mustard, salt, black pepper, and lemon juice into a creamy dressing.',
      'Fold the chicken, vegetables, and dressing together. Divide into 12 portions and refrigerate.',
    ],
  },
]
