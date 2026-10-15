import { unitOptionFor, unitOptionGroups } from './unitOptions'

export default function UnitPicker({ value, onChange, ariaLabel = 'Unit', required = false }: {
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  required?: boolean
}) {
  const selected = unitOptionFor(value)
  const custom = selected === null

  return <div className="unit-picker">
    <select
      aria-label={ariaLabel}
      value={custom ? '__custom__' : selected}
      onChange={(event) => onChange(event.target.value === '__custom__' ? '' : event.target.value)}
    >
      {unitOptionGroups.map((group) => <optgroup key={group.label} label={group.label}>
        {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </optgroup>)}
      <option value="__custom__">Custom unit…</option>
    </select>
    {custom && <input
      aria-label={`${ariaLabel} custom unit`}
      autoFocus={value === ''}
      required={required}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="e.g. tray or scoop"
    />}
  </div>
}

