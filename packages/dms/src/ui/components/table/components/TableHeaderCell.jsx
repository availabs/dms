import React, {memo, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import Icon from "../../Icon";
import Switch from "../../Switch";
import Popup from "../../Popup";
import { MultiSelectEdit as MultiselectEdit } from "../../MultiSelect"
import {getComponentTheme, ThemeContext} from "../../../../ui/useTheme";
import {ComponentContext} from "../../../../patterns/page/context";
import {useColumnOptions} from "../../../../patterns/page/components/sections/ConditionValueInput";

const getColIdName = col => col.normalName || col.name;
const Noop = () => {};
const ToggleControl = ({value, setValue}) => {
    if (!setValue) return null;

    return (
        <Switch
            size={'small'}
            enabled={value}
            setEnabled={setValue}
        />
    )
}

const InputControl = ({updateColumns, inputType, value='', attributeKey, onChange, dataFetch, className}) => {
    const [tmpValue, setTmpValue] = useState(value);

    useEffect(() => {
        const timeOutId = setTimeout(() => {
            if(value !== tmpValue) updateColumns(attributeKey, tmpValue, onChange, dataFetch)
        }, 300);

        return () => clearTimeout(timeOutId);
    }, [tmpValue]);

    return (
        <input
            className={className}
            type={inputType}
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
        />
    )
}

const TextAreaControl = ({updateColumns, value='', attributeKey, onChange, dataFetch, className}) => {
    const [tmpValue, setTmpValue] = useState(value);

    useEffect(() => {
        const timeOutId = setTimeout(() => {
            if(value !== tmpValue) updateColumns(attributeKey, tmpValue, onChange, dataFetch)
        }, 300);

        return () => clearTimeout(timeOutId);
    }, [tmpValue]);

    return (
        <textarea
            className={className}
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
        />
    )
}



// Server-backed column filter — writes to state.tableFilters (a runtime-only array, never
// persisted and never shown in the section menu's filter editor). Cleaned up on unmount.
const ServerFilterControl = ({ attribute, className }) => {
    const { state, setState: setCtxState } = useContext(ComponentContext) || {};
    const [search, setSearch] = useState('');
    const [textValue, setTextValue] = useState('');

    const cols = state?.columns || [];
    const isSelectType = ['select', 'multiselect', 'radio', 'checkbox'].includes(attribute.type);
    const op = isSelectType ? 'filter' : 'like';

    const existing = (state?.tableFilters || []).find(f => f.col === attribute.name);
    const currentValue = existing?.value;
    const selectedValues = isSelectType
        ? (Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []))
        : [];

    // Pre-seeded options from column config (mapped_options or static options array)
    const colDef = cols.find(c => c.name === attribute.name);
    const metaOptions = isSelectType ? (colDef?.options || []) : [];

    const { options, loading } = useColumnOptions(
        attribute.name, cols, op, search, selectedValues, [], attribute.source_id,
        isSelectType, // withCounts — only meaningful for multiselect UI
        metaOptions
    );

    // Sync text input when the filter value is changed externally (e.g. cleared elsewhere)
    useEffect(() => {
        if (!isSelectType) {
            const next = typeof currentValue === 'string' ? currentValue : '';
            setTextValue(prev => prev !== next ? next : prev);
        }
    }, [currentValue, isSelectType]);

    const updateFilter = useCallback((val) => {
        if (!setCtxState) return;
        setCtxState(draft => {
            if (!Array.isArray(draft.tableFilters)) draft.tableFilters = [];
            const idx = draft.tableFilters.findIndex(f => f.col === attribute.name);
            const hasValue = Array.isArray(val) ? val.length > 0 : (val !== '' && val != null);
            if (hasValue) {
                const node = { col: attribute.name, op, value: val };
                if (attribute.source_id) node.source_id = attribute.source_id;
                if (idx >= 0) draft.tableFilters[idx] = node;
                else draft.tableFilters.push(node);
            } else if (idx >= 0) {
                draft.tableFilters.splice(idx, 1);
            }
        });
    }, [setCtxState, attribute.name, attribute.source_id, op]);

    // Debounce text (like) filter updates
    useEffect(() => {
        if (isSelectType) return;
        const cur = typeof currentValue === 'string' ? currentValue : '';
        if (textValue === cur) return;
        const id = setTimeout(() => updateFilter(textValue || null), 300);
        return () => clearTimeout(id);
    }, [textValue, isSelectType]);

    if (isSelectType) {
        return (
            <MultiselectEdit
                className={className}
                value={selectedValues}
                options={options}
                loading={loading}
                onChange={(selected) => {
                    const values = (Array.isArray(selected) ? selected : [selected])
                        .map(item => item?.value ?? item);
                    updateFilter(values.length ? values : null);
                }}
                singleSelectOnly={false}
                displayDetailedValues={false}
                onSearch={setSearch}
            />
        );
    }

    return (
        <input
            className={className}
            type="text"
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            placeholder="search..."
        />
    );
};

// in header menu for each column
export default memo(function TableHeaderCell({isEdit, attribute, columns, display, controls, activeStyle, setState=Noop}) {
    const { theme: themeFromContext = {table: {}}} = React.useContext(ThemeContext) || {};
    const theme = getComponentTheme(themeFromContext,'table', activeStyle);

    const [open, setOpen] = useState(false);
    const colIdName = getColIdName(attribute);

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((key, value, onChange, dataFetch) => setState(draft => {
        // update requested key
        const idx = columns.findIndex(column => getColIdName(column) === colIdName);

        if (idx !== -1) {
            if(key){
                draft.columns[idx][key] = value;
            }else{
                draft.columns[idx] = {...(draft.columns[idx] || {}), ...(value || {})}
            }
        }

        if(onChange){
            onChange({attribute, key, value, columnIdx: idx})
        }

        if(dataFetch && !draft.display.readyToLoad){
            draft.display.readyToLoad = true;
        }

    }), [columns, attribute]);

    // When serverFilter is toggled off, clear this column's entry from state.tableFilters
    useEffect(() => {
        if (!attribute.serverFilter) {
            setState(draft => {
                if (!Array.isArray(draft?.tableFilters)) return;
                const idx = draft.tableFilters.findIndex(f => f.col === colIdName);
                if (idx >= 0) draft.tableFilters.splice(idx, 1);
            });
        }
    }, [attribute.serverFilter]);

    const iconSizes = {width: 14 , height: 14}
    const fnIcons = {
        count: <Icon icon={theme.headerCellCountIcon} key={'count-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        list: <Icon icon={theme.headerCellListIcon} key={'list-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        sum: <Icon icon={theme.headerCellSumIcon} key={'sum-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        avg: <Icon icon={theme.headerCellAvgIcon} key={'sum-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
    }

    return (
        <div key={colIdName} className={theme.headerCellWrapper}>
            <Popup preventCloseOnClickOutside={Boolean(attribute.serverFilter)} button={
                <div key={'menu-btn'}
                     className={`${theme.headerCellBtn} ${display.columnSelection?.includes(colIdName) ? theme.headerCellBtnActive : ``}`}
                     onClick={e => {
                         if(e.ctrlKey){
                             setState(draft => {
                                 const existingSelection = draft.display.columnSelection || [];
                                 draft.display.columnSelection = existingSelection.includes(colIdName) ? existingSelection.filter(name => name !== colIdName) : [...existingSelection, colIdName]
                             })
                         }else {
                             setState(draft => {
                                 draft.display.columnSelection = undefined;
                             })
                             setOpen(!open)
                         }
                     }}
                >
                    {
                        controls.header?.displayFn ? controls.header.displayFn(attribute) :
                            (
                                <span key={`${colIdName}-name`} className={`${theme.headerCellLabel} ${attribute.wrapHeader ? theme.wrapText : ``}`}
                                      title={attribute.customName || attribute.display_name || colIdName}>
                                {attribute.customName || attribute.display_name || colIdName}
                            </span>
                            )
                    }
                    <div className={theme.headerCellIconWrapper}>
                        {
                            // Group + fn indicators are admin-only chrome — show them in
                            // edit mode, hide in published view. Without this, calc-column
                            // headers print their `fn` (e.g. "exempt") as literal text next
                            // to the column name in the rendered report.
                            isEdit && attribute.group ? <Icon icon={theme.headerCellGroupIcon} key={`group-${colIdName}`} className={theme.headerCellFnIconClass} {...iconSizes} /> :
                                isEdit && attribute.fn ? fnIcons[attribute.fn] || attribute.fn : null
                        }
                        {
                            attribute.sort === 'asc nulls last' ? <Icon icon={theme.headerCellSortAscIcon} key={'sort-asc-icon'} className={theme.headerCellFnIconClass} {...iconSizes} /> :
                                attribute.sort === 'desc nulls last' ? <Icon icon={theme.headerCellSortDescIcon} key={'sort-desc-icon'} className={theme.headerCellFnIconClass} {...iconSizes} /> : null
                        }
                        {isEdit ? <Icon icon={theme.headerCellMenuIcon} key={`arrow-down-${colIdName}`} className={theme.headerCellMenuIconClass}/> : null}
                    </div>
                </div>
            }>
                {
                    ({open, setOpen}) =>
                        controls?.inHeader?.length ? (
                            <div key={'menu'}
                                 className={`${open ? 'visible' : 'hidden'} ${theme.headerCellMenu}`}
                            >
                                {
                                    controls.inHeader
                                        .filter(({displayCdn}) =>
                                            typeof displayCdn === 'function' ? displayCdn({attribute, display, isEdit}) :
                                                typeof displayCdn === 'boolean' ? displayCdn : true)
                                        .map(({type, inputType, label, key, dataFetch, options, onChange}) =>
                                            typeof type === 'function' ?
                                                type({
                                                    value: attribute[key],
                                                    setValue: newValue => updateColumns(key, newValue, onChange, dataFetch),
                                                    attribute,
                                                    setAttribute: newValue => updateColumns(undefined, newValue, onChange, dataFetch)
                                                }) :
                                                    <div key={`${colIdName}-${key}`} className={theme.headerCellControlWrapper}>
                                                        <label className={theme.headerCellControlLabel}>{label}</label>
                                                        {
                                                            type === 'toggle' ?
                                                                <ToggleControl
                                                                    className={theme.headerCellControl}
                                                                    title={label}
                                                                    value={attribute[key]}
                                                                    setValue={e => updateColumns(key, e, onChange, dataFetch)}
                                                                /> :
                                                            type === 'select' ?
                                                                <select
                                                                    className={theme.headerCellControl}
                                                                    value={attribute[key]}
                                                                    onChange={e => updateColumns(key, e.target.value, onChange, dataFetch)}
                                                                >
                                                                    { options.map(({label, value}) => <option key={value} value={value}>{label}</option>) }
                                                                </select> :
                                                                type === 'input' ?
                                                                    <InputControl
                                                                        className={theme.headerCellControl}
                                                                        inputType={inputType}
                                                                        value={attribute[key]}
                                                                        updateColumns={updateColumns}
                                                                        attributeKey={key}
                                                                        dataFetch={dataFetch}
                                                                    /> :
                                                                    type === 'textarea' ?
                                                                        <TextAreaControl
                                                                            className={theme.headerCellControl}
                                                                            value={attribute[key]}
                                                                            updateColumns={updateColumns}
                                                                            attributeKey={key}
                                                                            dataFetch={dataFetch}
                                                                        /> :
                                                                        type === 'filter' ?
                                                                            <ServerFilterControl
                                                                                className={theme.headerCellControl}
                                                                                attribute={attribute}
                                                                            /> :
                                                                            `${type} not available`
                                                        }
                                                    </div>
                                        )
                                }
                            </div>
                        ) : null
                }
            </Popup>
        </div>
    )
})
