import React, {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import Icon from "../../Icon";
import Switch from "../../Switch";
import Popup from "../../Popup";
import Multiselect from "../../../columnTypes/multiselect"
import {getComponentTheme, ThemeContext} from "../../../../ui/useTheme";

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


const FilterControl = ({updateColumns, type, value, attributeKey, onChange, dataFetch, localFilterData, className}) => {
    const [tmpValue, setTmpValue] = useState(value);

    useEffect(() => {
        const timeOutId = setTimeout(() => {
            if(value !== tmpValue) updateColumns(attributeKey, tmpValue, onChange, dataFetch)
        }, 300);

        return () => clearTimeout(timeOutId);
    }, [tmpValue]);

    const options = useMemo(() => {
        if(!['select', 'multiselect', 'radio'].includes(type) || !localFilterData) return undefined;
        return Array.from(localFilterData.values()).map(v => ({label: v.value ?? v, value: v.originalValue ?? v}))
        }, [type, localFilterData]);

    return ['select', 'multiselect', 'radio'].includes(type) ?
        <Multiselect.EditComp className={className}
                              value={value}
                              options={options}
                              onChange={setTmpValue}
                              singleSelectOnly={false}
                              displayDetailedValues={false}
        /> : (
        <input
            className={className}
            type={'text'}
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
        />
    )
}
// in header menu for each column
export default memo(function TableHeaderCell({isEdit, attribute, columns, localFilterData, display, controls, activeStyle, setState=Noop}) {
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

    const iconSizes = {width: 14 , height: 14}
    const fnIcons = {
        count: <Icon icon={theme.headerCellCountIcon} key={'count-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        list: <Icon icon={theme.headerCellListIcon} key={'list-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        sum: <Icon icon={theme.headerCellSumIcon} key={'sum-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
        avg: <Icon icon={theme.headerCellAvgIcon} key={'sum-icon'} className={theme.headerCellFnIconClass} {...iconSizes} />,
    }

    return (
        <div key={colIdName} className={theme.headerCellWrapper}>
            <Popup button={
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
                            attribute.group ? <Icon icon={theme.headerCellGroupIcon} key={`group-${colIdName}`} className={theme.headerCellFnIconClass} {...iconSizes} /> :
                                attribute.fn ? fnIcons[attribute.fn] || attribute.fn : null
                        }
                        {
                            attribute.sort === 'asc nulls last' ? <Icon icon={theme.headerCellSortAscIcon} key={'sort-asc-icon'} className={theme.headerCellFnIconClass} {...iconSizes} /> :
                                attribute.sort === 'desc nulls last' ? <Icon icon={theme.headerCellSortDescIcon} key={'sort-desc-icon'} className={theme.headerCellFnIconClass} {...iconSizes} /> : null
                        }
                        <Icon icon={theme.headerCellMenuIcon} key={`arrow-down-${colIdName}`} className={theme.headerCellMenuIconClass}/>
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
                                                                            <FilterControl
                                                                                className={theme.headerCellControl}
                                                                                type={attribute.type}
                                                                                localFilterData={localFilterData?.[attribute.name]}
                                                                                value={attribute[key]}
                                                                                updateColumns={updateColumns}
                                                                                attributeKey={key}
                                                                                dataFetch={dataFetch}
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
