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
    // the toggle is ColumnTypes.checkbox with its text (`rowLabel`); `toggleCheckboxStyle` names its checkbox named
    // style (unset = the checkbox default). A project theme's own toggleWrapper / checkbox / toggleLabel are lifted into
    // one (src/themes/_legacy/ui.js liftPatternRoles).
    toggleCheckboxStyle: 'filterToggle',
    loading: 'text-xs text-gray-400',
};
