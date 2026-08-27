// Theme for the `filter_control` column type — a Card cell that hosts a
// viewer-facing filter control (select / search) writing a page variable.
// Flat map (pattern-tied convention). The wrapper is the control's "pill";
// site themes restyle it (e.g. mny's white rounded-full pill on the tinted
// filter band). The CONTROL inside is themed separately via the column's
// `activeStyle` (a named style of `theme.multiselect` / `theme.input`).
export const filterControlCellTheme = {
    wrapper: 'w-full flex items-center gap-1.5',
    label: 'text-sm text-gray-600 whitespace-nowrap',
    icon: 'size-4 text-gray-400 shrink-0',
    toggleWrapper: 'flex items-center gap-1.5 cursor-pointer',
    checkbox: 'size-4 rounded border-gray-300',
    loading: 'text-xs text-gray-400',
};
