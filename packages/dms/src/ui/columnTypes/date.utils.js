// Native <input type="date"> only accepts a strict ISO "YYYY-MM-DD" value (the HTML
// living standard's date-input value-sanitization algorithm blanks anything else, even
// though the underlying stored value is untouched) — and external/DAMA sources routinely
// mix ISO ("2026-07-15") and locale ("7/16/2021") date strings within the same column.
// Rather than try to preserve/reproduce whichever format a row happens to be stored in,
// both the edit and view renderers normalize to ISO — simple, consistent, no ambiguity.

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

// Normalizes any parseable date string to "YYYY-MM-DD". Uses local date parts (not
// toISOString, which is UTC) so a bare "7/16/2021" — parsed by `Date` as local midnight —
// doesn't shift a day when reformatted. Returns '' for empty/unparseable input.
export const toISODateValue = (value) => {
  if (!value) return '';
  const isoMatch = ISO_DATE_PREFIX.exec(value);
  if (isoMatch) return isoMatch[0];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
