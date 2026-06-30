// Shared category color + split helpers for the datasets pattern.
// Used by the catalog (DatasetsList) and the source Overview so a given top-level
// area hashes to the SAME swatch in both places — consistent, distinct colors
// without a hardcoded per-category map.

// Stable index for a string, hashed into a palette of length n.
export const hashIndex = (str, n) => {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return n ? h % n : 0;
};

// Fallback palette when a theme doesn't supply `categorySwatches` / `catSwatches`.
export const FALLBACK_SWATCHES = ['#1F3F8F', '#B45309', '#37576B', '#047857', '#0F2D4D', '#7C3AED', '#0E7490', '#9D174D'];

// Color for a top-level category area.
export const catColor = (area, swatches) =>
    (swatches && swatches.length ? swatches : FALLBACK_SWATCHES)[hashIndex(area, (swatches && swatches.length) || FALLBACK_SWATCHES.length)];

// Split a source's `categories` 2-D array into unique top-level areas + secondary
// (Top/Sub) categories. Accepts anything with a `categories` array.
export const splitCategories = (source) => {
    const cats = Array.isArray(source?.categories) ? source.categories : [];
    const tops = [...new Set(cats.map(c => (Array.isArray(c) ? c[0] : c)).filter(Boolean))];
    const subs = [...new Map(
        cats.filter(c => Array.isArray(c) && c.length > 1 && c[1])
            .map(c => { const path = `${c[0]}/${c[1]}`; return [path, { label: c[1], path }]; })
    ).values()];
    return { tops, subs };
};
