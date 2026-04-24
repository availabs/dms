export const actionsColSize = 30;
export const numColSize = 20;
export const gutterColSize = 20;
export const minColSize = 150
// Floor applied by the auto-resize useEffect when computing initial column
// widths: `Math.max(minInitColSize, gridWidth / visibleColumnCount)`. Bumped
// from 150 so spreadsheets with many columns don't render them unreadably
// narrow; columns still scroll horizontally past the container as usual.
export const minInitColSize = 200
