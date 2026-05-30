import { FilterEdit, FilterView } from './FilterComponent'

// Build the "Filter style" options from the resolved `filters` theme block, so a
// site author picks a whole NAMED filter DESIGN (e.g. 'panel', 'chip', 'labeled',
// 'tone_bar') in the section toolbar. Each style bundles wrapper + label + row +
// placement + the multiselect `controlStyle` it passes down to its value control.
// ExternalFilters/RenderFilters resolve it via getComponentTheme(theme,'filters',
// display.filterStyle). Empty value = the filters block's options.activeStyle default.
const buildFilterStyleOptions = (theme) => {
    const styles = theme?.filters?.styles || [];
    return [{ label: '(theme default)', value: '' }, ...styles.map(s => ({ label: s.name, value: s.name }))];
};

// controls is a function of the merged theme (same contract as Card.config) so
// the Filter-style options can be sourced from the live theme.
const buildControls = (theme) => ({
    columns: [],
    more: [
        { type: 'input', inputType: 'number', label: 'Grid Size', key: 'gridSize', min: 1, max: 5 },
        { type: 'select', label: 'Filter style', key: 'filterStyle',
            options: buildFilterStyleOptions(theme) },
        { type: 'select', label: 'Placement (override)', key: 'placement',
            options: [{ label: '(style default)', value: '' }, { label: 'stacked', value: 'stacked' }, { label: 'inline', value: 'inline' }] },
        { type: 'toggle', label: 'Attribution', key: 'showAttribution' },
    ],
});

export default {
    "name": 'Filter',
    "type": 'filter',
    "variables": [],
    useDataSource: true,
    useDataWrapper: true,
    defaultState: {
        filters: { op: 'AND', groups: [] },
        columns: [],
        display: { showAttribution: false },
        externalSource: {}
    },
    controls: buildControls,
    "EditComp": FilterEdit,
    "ViewComp": FilterView
}
