import React from 'react';
import { MultiSelectEdit } from './MultiSelect';

// Single-value wrapper around MultiSelect. `singleSelectOnly` is forced on,
// so callers don't repeat the flag at every site. `value` accepts a single
// string instead of a one-element array; `onChange` is invoked with the
// chosen string (not an array). Searchable defaults off — most single-value
// uses are short option lists where typing-to-filter isn't needed.
export default function SelectComp({
  value,
  onChange = () => {},
  options = [],
  searchable = false,
  ...rest
}) {
  const arrayValue = value == null || value === '' ? [] : [value];
  const handleChange = (selected) => {
    const next = Array.isArray(selected) ? selected[0] : selected;
    onChange(next);
  };
  return (
    <MultiSelectEdit
      {...rest}
      singleSelectOnly
      searchable={searchable}
      options={options}
      value={arrayValue}
      onChange={handleChange}
    />
  );
}
