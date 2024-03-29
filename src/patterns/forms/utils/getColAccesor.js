export const getAccessor = (col, form) => {
    return array_columns[form]?.find(array_col => col.includes(array_col)) ? jsonAccessor : textAccessor;
}
export const getColAccessor = (fn, col, origin, form) => (origin === 'calculated-column' || !col) ? (fn[col] || col):
    fn[col] && fn[col].includes('data->') ? fn[col] :
        fn[col] && !fn[col].includes('data->') && fn[col].toLowerCase().includes(' as ') ?
            fn[col].replace(col, `${getAccessor(col, form)}'${col}'`) :
            fn[col] && !fn[col].includes('data->') && !fn[col].toLowerCase().includes(' as ') ?
                `${fn[col].replace(col, `${getAccessor(col, form)}'${col}'`)} as ${col}` :
                `${getAccessor(col, form)}'${col}' as ${col}`;