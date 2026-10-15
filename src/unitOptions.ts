import { normalizeMeasurementUnit } from './measurements'

export type UnitOptionGroup = { label: string; options: Array<{ value: string; label: string }> }

export const unitOptionGroups: UnitOptionGroup[] = [
  {
    label: 'Count & packages',
    options: [
      ['item', 'Item'], ['whole', 'Whole'], ['piece', 'Piece'], ['clove', 'Clove'], ['slice', 'Slice'],
      ['bunch', 'Bunch'], ['pack', 'Pack'], ['package', 'Package'], ['bag', 'Bag'], ['box', 'Box'],
      ['bottle', 'Bottle'], ['can', 'Can'], ['carton', 'Carton'], ['jar', 'Jar'],
    ].map(([value, label]) => ({ value, label })),
  },
  {
    label: 'Weight',
    options: [
      ['mg', 'Milligrams (mg)'], ['g', 'Grams (g)'], ['kg', 'Kilograms (kg)'],
      ['oz', 'Ounces (oz)'], ['lb', 'Pounds (lb)'],
    ].map(([value, label]) => ({ value, label })),
  },
  {
    label: 'Volume',
    options: [
      ['ml', 'Millilitres (ml)'], ['L', 'Litres (L)'], ['fl oz', 'Fluid ounces (fl oz)'],
      ['pint', 'Pint'], ['quart', 'Quart'], ['gallon', 'Gallon'],
    ].map(([value, label]) => ({ value, label })),
  },
  {
    label: 'Cooking measures',
    options: [['tsp', 'Teaspoon (tsp)'], ['tbsp', 'Tablespoon (tbsp)'], ['cups', 'Cup']]
      .map(([value, label]) => ({ value, label })),
  },
]

const options = unitOptionGroups.flatMap((group) => group.options)

export function unitOptionFor(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const exact = options.find((option) => option.value.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact.value
  const normalized = normalizeMeasurementUnit(trimmed)
  return options.find((option) => normalizeMeasurementUnit(option.value) === normalized)?.value || null
}

