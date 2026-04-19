import React, { useMemo, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react';

/**
 * Searchable single-select combobox. Drop-in replacement for the legacy
 * `FilterableSearch` component that was built on `react-bootstrap-typeahead`
 * — removes that dependency.
 *
 * Props:
 *   - options: Array<{ label: string, key: string | number }>
 *   - value: string | number — the currently-selected key
 *   - onChange: (key) => void — called with the newly-selected key
 *   - placeholder?: string
 *   - className?: string — applied to the outer wrapper
 *   - disabled?: boolean
 */
export default function ComboBox({
  options = [],
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  disabled = false,
}) {
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => options.find((o) => String(o.key) === String(value)) || null,
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => String(o.label ?? '').toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Combobox
      value={selectedOption}
      onChange={(opt) => {
        if (opt && onChange) onChange(opt.key);
      }}
      disabled={disabled}
    >
      <div className={`relative flex items-center bg-white p-1 pl-3 rounded-md ${className}`}>
        <i className="fa fa-search font-light text-xl pr-2 text-slate-400" aria-hidden="true" />
        <ComboboxInput
          className="w-full p-1 outline-none bg-transparent"
          displayValue={(opt) => opt?.label ?? ''}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
        />
        <ComboboxButton className="px-1 text-slate-400 hover:text-slate-600">
          <i className="fa fa-chevron-down" aria-hidden="true" />
        </ComboboxButton>
        <ComboboxOptions
          anchor="bottom start"
          className="w-[var(--input-width)] bg-white rounded-md shadow-lg ring-1 ring-zinc-950/5 max-h-60 overflow-auto z-[100] empty:invisible mt-1"
        >
          {filtered.map((opt, i) => (
            <ComboboxOption
              key={`${opt.key}_${i}`}
              value={opt}
              className="block px-3 py-1.5 text-sm cursor-pointer data-[focus]:bg-slate-100 data-[selected]:bg-blue-50 data-[selected]:font-medium"
            >
              {opt.label}
            </ComboboxOption>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400 italic">No matches</div>
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
