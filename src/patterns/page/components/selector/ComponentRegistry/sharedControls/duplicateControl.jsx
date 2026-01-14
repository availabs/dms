import React, {useContext} from "react";
import {getColumnLabel, isEqualColumns} from "../../dataWrapper/utils/utils";
import {cloneDeep} from "lodash-es";
import {ThemeContext} from "../../../../../../ui/useTheme";

export const duplicateControl = {
    label: 'duplicate',
    type: ({attribute, setState}) => {
        const {UI} = useContext(ThemeContext);
        const {Icon} = UI;
        const duplicate = () => {
            setState(draft => {
                let idx = draft.columns.findIndex(col => isEqualColumns(col, attribute));
                if (idx === -1) {
                    draft.columns.push({...attribute, normalName: `${attribute.name}_original`});
                    idx = draft.columns.length - 1; // new index
                }
                const columnToAdd = cloneDeep(draft.columns[idx]);
                const numDuplicates = draft.columns.filter(col => col.isDuplicate && col.name === columnToAdd.name).length;

                columnToAdd.isDuplicate = true;
                columnToAdd.copyNum = numDuplicates + 1;
                columnToAdd.normalName = `${columnToAdd.name}_copy_${numDuplicates + 1}`
                columnToAdd.display_name = `${getColumnLabel(columnToAdd)} Copy ${numDuplicates+1}`;
                // columnToAdd.originalName = columnToAdd.name;
                // columnToAdd.name += ` - copy - ${numDuplicates}`
                console.log('column to add', columnToAdd)
                // draft.columns.push(columnToAdd)
                draft.columns.splice(idx, 0, columnToAdd)
            })
        }
        return (
            <div className={'flex place-content-center'} onClick={() => duplicate()}>
                <Icon icon={'Copy'} className={'text-gray-500 hover:text-gray-700'} />
            </div>)
    }}