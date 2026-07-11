import React, {useContext, useEffect, useRef, useState} from "react"
import {cloneDeep} from "lodash-es";

import {RenderField} from "./components/RenderField";
import {RenderAddField} from "./components/RenderAddField";
import {DatasetsContext} from "../../context";
import {ThemeContext} from "../../../../ui/useTheme";
import {metadataCompTheme} from "./metadataComp.theme";

const parseJson = value => {
    try {
        return JSON.parse(value)
    } catch (e) {
        return value
    }
}

export default function MetadataComp ({isDms, value = '{}', accessKey, onChange, onIndexChange, onSetPrimaryKey, pkeyInfo, className, apiLoad, format}) {
    const {UI} = useContext(DatasetsContext)
    const {Input, Icon} = UI;
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const [item, setItem] = useState(parseJson(value || {}) || {})
    const [search, setSearch] = useState('');
    const [pkeyError, setPkeyError] = useState(null);
    const dragItem = useRef();
    const dragOverItem = useRef();

    useEffect(() => setItem(parseJson(value || {})), [value]);
    console.log('value', value, item)
    // ================================================== drag utils start =============================================
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };
    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = (e) => {
        const copyListItems = cloneDeep(item[accessKey]);
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        const newItem = {...item, [accessKey]: copyListItems}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    };
    // ================================================== drag utils end ===============================================

    // after changing meta, set a flag to say validation needs to re-run
    const updateAttribute = (col, value) => {
        const newAttribute = (item?.[accessKey] || []).map(column => column.name === col ? {...column, ...value} : column)
        const newItem = {...item, [accessKey]: newAttribute, is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const addAttribute = (value) => {
        // here, value is the new attribute. this triggers on changing the name field.
        // value should be {name: 'xyz'}. after this triggers, the field controls are presented and edited via updateAttributes.
        const newItem = {...item, [accessKey]: [...(item[accessKey] || []), value], is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    const setIndex = (colName, enable) => {
        const allCols = item[accessKey] || [];
        const updated = allCols.map(c => {
            if (c.name !== colName) return c;
            if (enable) return { ...c, isIndex: true };
            const { isIndex: _, ...rest } = c;
            return rest;
        });

        if (onIndexChange) {
            // Targeted CALL route — update optimistically, skip full save
            setItem({ ...item, [accessKey]: updated });
            onIndexChange(colName, enable);
        } else {
            // Fallback: full save via onChange (no onIndexChange provided)
            const newItem = { ...item, [accessKey]: updated, is_dirty: true };
            setItem(newItem);
            onChange(JSON.stringify(newItem));
        }
    };

    // Unlike setIndex, this is not optimistic — the server validates the column has no
    // NULLs/duplicates before running ALTER TABLE (when enabling), so we only update local
    // state on success and surface the error otherwise (see set_primary_col_from_meta.md).
    const setPrimaryKey = async (colName, enable = true) => {
        if (!onSetPrimaryKey) return;
        setPkeyError(null);
        try {
            await onSetPrimaryKey(colName, enable);
            const allCols = item[accessKey] || [];
            const updated = allCols.map(c => {
                if (c.name === colName) {
                    if (enable) return { ...c, isPrimaryKey: true };
                    const { isPrimaryKey: _, ...rest } = c;
                    return rest;
                }
                if (enable && c.isPrimaryKey) { const { isPrimaryKey: _, ...rest } = c; return rest; }
                return c;
            });
            setItem({ ...item, [accessKey]: updated });
        } catch (e) {
            setPkeyError(e?.message || `Failed to ${enable ? 'set' : 'remove'} primary key`);
        }
    };

    const removeAttribute = (col) => {
        const newItem = {...item, [accessKey]: item[accessKey].filter(attr => attr.name !== col), is_dirty: true}
        setItem(newItem)
        onChange(JSON.stringify(newItem))
    }

    return (
        <div className={t.container}>
            <div className={t.searchWrapper}>
                <Input value={search} onChange={e => setSearch(e.target.value)} placeHolder={'search...'}/>
                {
                    item.is_dirty ?
                        <div className={t.dirtyWarning}>
                            <Icon icon={'Alert'} className={t.dirtyWarningIcon}/>
                            <span>Metadata has changed since last data validation. Please re-run validate to ensure accuracy.</span>
                        </div> : null
                }
                {
                    pkeyError ?
                        <div className={t.dirtyWarning}>
                            <Icon icon={'Alert'} className={t.dirtyWarningIcon}/>
                            <span>{pkeyError}</span>
                        </div> : null
                }
            </div>
            <div className={t.fieldListScroll}>
                {
                    (item?.[accessKey] || [])
                        .filter(attribute =>
                            !search ||
                            (attribute.name.toLowerCase().includes(search.toLowerCase()) ||
                                attribute.display_name?.toLowerCase()?.includes(search.toLowerCase()))
                        )
                        .map((attribute, i) => {
                            return (
                                <RenderField i={i} item={attribute} id={`field-comp-${i}`} key={`field-comp-${i}`}
                                             attribute={attribute?.name}
                                             attributeList={(item[accessKey] || []).map(a => a.name)}
                                             updateAttribute={updateAttribute}
                                             removeAttribute={removeAttribute} apiLoad={apiLoad} format={format}
                                             dragStart={dragStart} dragEnter={dragEnter} dragOver={dragOver} drop={drop}
                                             isDms={isDms}
                                             onSetIndex={setIndex}
                                             onSetPrimaryKey={onSetPrimaryKey ? setPrimaryKey : undefined}
                                             pkeyInfo={pkeyInfo}
                                />
                            )
                        })
                }
            </div>

            <div className={t.addFieldWrapper}>
                <RenderAddField attributes={item[accessKey]} placeHolder={'New field name...'}
                          className={className} addAttribute={addAttribute}/>
            </div>
        </div>
    )
}
