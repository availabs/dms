const array_columns = {
    "Actions": [
        'associated_hazards',
        'domain_categorization'
    ],
    "Capabilities": [
        'associated_hazards',
        'buildings',
        'infrastructure',
        'natural_environment',
        'emergency_management_phase',
        'category',
        'integrated_capacity_building',
        'climate_change',
        'status',
        'can_provide_fun_or_resources_for',
        'funding_source_type',
        'eligibility'
    ],
    "Mitigation Measures": [
        'associated_hazards',
        'planning_and_regulatory',
        'property_protection_and_infrastructure',
        'natural_resource_protection_and_restoration'
    ],
    "R+V Matrix": [
        'associated_hazards'
    ]
}
const jsonAccessor = 'data->';
const textAccessor = 'data->>';

export const getAccessor = (col, form) => {
    //return array_columns[form]?.find(array_col => col.includes(array_col)) ? jsonAccessor : textAccessor;
    return textAccessor
}
export const getColAccessor = (fn, col, origin, form) => (origin === 'calculated-column' || !col) ? (fn[col] || col):
    fn[col] && fn[col].includes('data->') ? fn[col] :
        fn[col] && !fn[col].includes('data->') && fn[col].toLowerCase().includes(' as ') ?
            fn[col].replace(col, `${getAccessor(col, form)}'${col}'`) :
            fn[col] && !fn[col].includes('data->') && !fn[col].toLowerCase().includes(' as ') ?
                `${fn[col].replace(col, `${getAccessor(col, form)}'${col}'`)} as ${col}` :
                `${getAccessor(col, form)}'${col}' as ${col}`;