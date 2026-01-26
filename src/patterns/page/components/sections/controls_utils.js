import {cloneDeep} from "lodash-es";
import {useCallback} from "react";

export const getColumnLabel = (column) =>
    column.customName || column.display_name || column.name;
export const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

// updates column if present, else adds it with the change the user made.
export const updateColumns = (originalAttribute, key, value, onChange, setState) => {
    setState(draft => {
        // ======================= default behaviour begin =================================

        let idx = draft.columns.findIndex(column => {
            return isEqualColumns(column, originalAttribute)
        });

        if (idx === -1) {
            draft.columns.push({ ...originalAttribute, [key]: value });
            idx = draft.columns.length - 1; // new index
        } else if(key){
            draft.columns[idx][key] = value;
        }else{
            draft.columns[idx] = {...(draft.columns[idx] || {}), ...(value || {})}
        }
        // ======================= default behaviour end ==================================

        // special cases: show, group and fn are close enough to the data wrapper to be handled here
        if (key === 'show' && value === false) {
            // stop sorting and applying fn when column is hidden
            draft.columns[idx].sort = undefined;
            draft.columns[idx].fn = undefined;
        } else if (key === 'show' && value === true &&
            !draft.columns[idx].group && // grouped column shouldn't have fn
            draft.columns.some(c => !isEqualColumns(c, originalAttribute) && c.group)
        ) {
            // apply fn if at least one column is grouped
            draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
        }

        if (key === 'group' && value === true) {
            // all other visible columns must have a function
            draft.columns[idx].fn = undefined;
            draft.columns
                .filter(c => !isEqualColumns(c, originalAttribute) && c.show && !c.group && !c.fn)
                .forEach(col => {
                    col.fn = col.defaultFn?.toLowerCase() || 'list';
                });
        }

        if (key === 'group' && value === false && draft.columns.some(c => !isEqualColumns(c, originalAttribute) && c.group)) {
            // if grouping by other columns, apply fn when removing group for current column
            draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
        }

        if(onChange) {
            onChange({key, value, attribute: originalAttribute, state: draft, columnIdx: idx})
        }
    });
};
export const duplicate = (column, setState) => {
    setState(draft => {
        let idx = draft.columns.findIndex(col => isEqualColumns(col, column));
        if (idx === -1) {
            draft.columns.push({...column, normalName: `${column.name}_original`});
            idx = draft.columns.length - 1; // new index
        }
        const columnToAdd = cloneDeep(draft.columns[idx]);
        const numDuplicates = draft.columns.filter(col => col.isDuplicate && col.name === columnToAdd.name).length;

        columnToAdd.isDuplicate = true;
        columnToAdd.copyNum = numDuplicates + 1;
        columnToAdd.normalName = `${columnToAdd.name}_copy_${numDuplicates + 1}`
        columnToAdd.display_name = `${getColumnLabel(columnToAdd)} Copy ${numDuplicates+1}`;
        draft.columns.splice(idx, 0, columnToAdd)
    })
}
export const resetColumn = (originalAttribute, setState) => setState(draft => {
    const idx = draft.columns.findIndex(column => isEqualColumns(column, originalAttribute));
    if (idx !== -1) {
        draft.columns.splice(idx, 1);
    }
});
export const resetAllColumns = (setState) => setState(draft => {
    draft.columns = []
    draft.dataRequest = {}
});

export const toggleIdFilter = (setState) =>
    setState(draft => {
        const idx = draft.columns.findIndex(c => c.systemCol && c.name === 'id');
        if(idx >= 0){
            draft.columns.splice(idx, 1);
        }else{
            draft.columns.splice(0, 0, {name: 'id', display_name: 'ID', systemCol: true})
        }
    })
export const toggleGlobalVisibility = (show = true, setState) => {
    setState(draft => {
        const isGrouping = draft.columns.some(({group}) => group);
        (draft.sourceInfo.columns || []).forEach(column => {
            let idx = draft.columns.findIndex(draftColumn => isEqualColumns(draftColumn, column));

            if (idx === -1) {
                draft.columns.push({ ...column, show });
                idx = draft.columns.length - 1; // new index
            } else {
                draft.columns[idx]['show'] = show;
            }

            if (show && isGrouping && !draft.columns[idx].group && !draft.columns[idx].fn) {
                draft.columns[idx]['fn'] = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            } else if (!show){
                draft.columns[idx].sort = undefined;
                draft.columns[idx].fn = undefined;
            }
        });
    });
};
export const addFormulaColumn = (column, setState) => setState(draft => {
    if(column.name && column.formula){
        draft.columns.push(column)
    }

    if(column.variables?.length){
        column.variables.forEach(col => {
            const idx = draft.columns.findIndex(draftCol => isEqualColumns(draftCol, col));

            if ( idx !== -1 &&
                !draft.columns[idx].group && // grouped column shouldn't have fn
                draft.columns.some(c => !isEqualColumns(c, col) && c.group) && // if there are some grouped columns
                !draft.columns[idx].fn
            ) {
                // apply fn if at least one column is grouped
                draft.columns[idx].fn = draft.columns[idx].defaultFn?.toLowerCase() || 'list';
            }
        })
    }
})
export const updateDisplayValue = (key, value, onChange, setState) => {
    setState(draft => {
        draft.display[key] = value;

        if(key === 'allowEditInView' && value){
            draft.columns.forEach(column => {
                column.allowEditInView = true;
            })
        }

        if(onChange) {
            onChange({key, value, state: draft})
        }
    })
}