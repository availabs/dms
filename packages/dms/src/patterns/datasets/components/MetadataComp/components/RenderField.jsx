import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";
import {metadataCompTheme} from "../metadataComp.theme";
import {Metadata} from "./Metadata";

const fieldTypes = [
    { value: 'text', label: 'text' },
    { value: 'string', label: 'string (text)' },
    { value: 'textarea', label: 'text area' },
    { value: 'lexical', label: 'rich text' },
    { value: 'number', label: 'number', dataType: 'numeric' },
    { value: 'integer', label: 'integer (number)', dataType: 'numeric' },
    { value: 'date', label: 'date', dataType: 'date' },
    { value: 'timestamp', label: 'timestamp', dataType: 'timestamp' },
    { value: 'select', label: 'dropdown' },
    { value: 'multiselect', label: 'dropdown (multiple choice)' },
    { value: 'switch', label: 'switch'},
    { value: 'radio', label: 'radio' },
    { value: 'checkbox', label: 'checkbox' },
    { value: 'calculated', label: 'calculated' } // can't be inputted, always calculated. don't use data->> to access.
];

// required to sort differently than the input type.
// select, multiselect are saved as text, but may need to be sorted numerically
const dataTypes = [
    { value: 'text', label: 'text' },
    { value: 'numeric', label: 'numeric' },
    // { value: 'boolean', label: 'Boolean' },4
    { value: 'date', label: 'date' },
    { value: 'timestamp', label: 'timestamp' }
];

// certain calculated columns (array output) may beed to be shown as select/multiselect,
// but they still need to be identified as calculated.
const behaviourTypes = [
    { value: 'data', label: 'data' },
    { value: 'meta', label: 'meta' },
    { value: 'calculated', label: 'calculated' }
];

const defaultFnTypes = [
    { value: 'sum', label: 'sum' },
    { value: 'list', label: 'list' },
    { value: 'count', label: 'count' }
];

const RenderInputText = ({label, value, col, attr, disabled, hidden, updateAttribute}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Input} = UI;
    const [newValue, setNewValue] = useState(value);

    const delayedUpdate = (val) => setTimeout(updateAttribute(col, {[attr]: val}), 500);
    if(hidden) return null;
    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>{label}</label>
            <Input
                type={'text'}
                disabled={disabled}
                value={newValue}
                placeHolder={label}
                onChange={e => {
                    setNewValue(e.target.value)
                    delayedUpdate(e.target.value)
                }}
            />
        </div>
    )
}

const RenderInputSelect = ({disabled, label, value='', col, attr, updateAttribute, placeHolder='please select...', options}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {MultiSelect} = UI;

    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>{label}</label>
            <MultiSelect
                disabled={disabled}
                singleSelectOnly
                searchable={false}
                value={value}
                onChange={v => {
                    const valueToUpdate = {[attr]: v};
                    if(attr === 'type') {
                        valueToUpdate['dataType'] = options.find(o => o.value === v)?.dataType || undefined;

                    }
                    updateAttribute(col, valueToUpdate)
                }}
                options={[{label: placeHolder, value: undefined}, ...options]}
            />
        </div>
    )
}


const RenderInputSwitch = ({label, value='', col, attr, updateAttribute, trueValue=true, disabled}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Switch} = UI;

    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>{label}</label>
            <Switch
                enabled={value === trueValue}
                disabled={disabled}
                setEnabled={e => updateAttribute(col, {[attr]: e ? trueValue : false})}
                size={'small'}
            />
        </div>
    )
}

const RenderIndexSwitch = ({value, col, onSetIndex, disabled}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Switch} = UI;
    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>Index</label>
            <Switch
                enabled={!!value}
                disabled={disabled}
                setEnabled={e => onSetIndex(col, e)}
                size={'small'}
            />
        </div>
    );
};

// External sources only — internal_table sources already have a synthetic PK and never
// render this. A column's own switch stays clickable both ways: turning it on sets the
// primary key (server-validated), turning it off drops the constraint (confirmed via
// modal — it's a destructive DDL operation and also disables editing for this source).
// Other columns' switches disable while any column already holds the primary key.
//
// State comes entirely from `pkeyInfo` (live pg_index detection, refetched on load and
// after every successful set) — never from `item.isPrimaryKey` (the stored metadata
// flag). The stored flag is written for server-side bookkeeping but can drift out of
// sync with the real DB (e.g. someone drops the constraint directly in Postgres), and
// trusting it here would leave the badge stuck showing a PK that no longer exists, with
// no way to re-trigger a set on that column.
const RenderPrimaryKeySwitch = ({item, col, pkeyInfo, onSetPrimaryKey, canEdit = true}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Switch, Modal, Button} = UI;
    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const isThisColumnPk = !!(pkeyInfo?.hasPkey && pkeyInfo?.pkeyColumn === col);
    const anotherColumnIsPk = pkeyInfo?.hasPkey && pkeyInfo?.pkeyColumn && pkeyInfo.pkeyColumn !== col;
    const disabled = !canEdit || anotherColumnIsPk;
    const title = isThisColumnPk
        ? (pkeyInfo?.isDetectedExisting ? 'Detected as the existing primary key — click to remove' : 'Primary key — click to remove')
        : anotherColumnIsPk
            ? `Column "${pkeyInfo.pkeyColumn}" is already the primary key`
            : 'Set as primary key — requires unique, non-null values';
    return (
        <div className={t.inputWrapper} title={title}>
            <label className={t.label}>Primary Key</label>
            <Switch
                enabled={isThisColumnPk}
                disabled={disabled}
                setEnabled={e => e ? onSetPrimaryKey(col, true) : setShowRemoveModal(true)}
                size={'small'}
            />
            <Modal open={showRemoveModal} setOpen={setShowRemoveModal} className={t.deleteModalBorder}>
                <div className={t.deleteTitle}>Remove Primary Key</div>
                <div className={t.deleteMessage}>
                    This drops the PRIMARY KEY constraint on column <span className={'font-semibold'}>{col}</span> from
                    the underlying table, and disables editing for this source until a new primary key is set.
                    <div>This action can not be undone from here.</div>
                </div>
                <Button
                    activeStyle={'danger'}
                    onClick={() => { onSetPrimaryKey(col, false); setShowRemoveModal(false); }}
                >
                    remove primary key
                </Button>
            </Modal>
        </div>
    );
};

const RenderInputButtonSelect = ({label, value='', col, attr, updateAttribute, options, disabled}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {ButtonSelect} = UI;

    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>{label}</label>
            <ButtonSelect
                value={value}
                options={options}
                disabled={disabled}
                onChange={e => !disabled && updateAttribute(col, {[attr]: e})}
            />
        </div>
    )
}

const RenderInputLexical = ({label, value, col, attr, updateAttribute}) => {
    const {UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {ColumnTypes: {lexical: {EditComp}}} = UI;
    // Lexical's onChange fires once on mount as a side effect of hydrating `value` into
    // the editor, not from typing — and can also fire on a selection-only commit with no
    // content change. `e` is a Lexical EditorState, not a string, so `.toString()` gives
    // "[object Object]" for every call and never distinguishes them. `JSON.stringify(e)`
    // invokes EditorState's own `toJSON()` (selection excluded), giving a real content
    // fingerprint. There's no reliable fingerprint for `value` to seed from up front (it
    // may be plain text or a lexical-JSON string, and duplicating Lexical's own hydration
    // shape here would be fragile) — so the first call seeds the baseline instead of
    // being propagated, and every call after that only proceeds if the content actually
    // changed since the last one seen.
    const lastSerialized = useRef(null);
    // Propagating on every keystroke round-trips through MetadataComp's setItem/onChange
    // (a network save) before the next character can render — and since this field isn't
    // rendered `editable` to the lexical wrapper, each resulting `value` prop change
    // re-triggers its hydrate-on-value-change effect, resetting the editor mid-typing.
    // Debounce the propagation, not the typing: Lexical keeps its own state locally and
    // stays responsive; only the outward call waits for a pause.
    const debounceRef = useRef(null);
    useEffect(() => () => clearTimeout(debounceRef.current), []);
    return (
        <div className={t.inputWrapper}>
            <label className={t.label}>{label}</label>
            <EditComp
                value={value}
                bgColor={'#ffffff'}
                onChange={e => {
                    const serialized = JSON.stringify(e);
                    const changed = lastSerialized.current !== null && serialized !== lastSerialized.current;
                    lastSerialized.current = serialized;
                    if (!changed) return;
                    clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(() => updateAttribute(col, {[attr]: e}), 500);
                }}
                placeHolder={label}
            />
        </div>
    )
}

const RenderAddForm = ({editing, newOption, setNewOption, addNewValue, value}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Input, Button} = UI;

    if(editing !== undefined) return null;
    return (
        <div className={t.optionFormRow}>
            <Input
                value={newOption}
                onChange={e => {
                    setNewOption(e.target.value)
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        newOption?.length && addNewValue(value, newOption) // only add if not blank
                    }
                }}
                placeHolder={'Add new option...'}
            />
            <Button
                activeStyle={'active'}
                onClick={e => newOption?.length && addNewValue(value, newOption)}>
                add
            </Button>
        </div>
    )
}

const RenderEditingForm = ({editingIndex, item, setEditing, value, replaceValue}) => {
    if(editingIndex === undefined) return null;

    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Input, Textarea, Button} = UI;
    const [editingCopy, setEditingCopy] = useState(item); // using prop as state is fine since uniq key is used to render this component.

    return (
        <div className={t.optionFormRow}>
            <Input
                value={editingCopy.label}
                onChange={e => setEditingCopy({...editingCopy, label: e.target.value})}
                placeHolder={'label'}
            />
            <Input
                value={editingCopy.value} // if you change value, it's not going to match
                disabled={true}
                onChange={e => setEditingCopy({...editingCopy, value: e.target.value})}
                placeHolder={'value'}
            />
            <Textarea
                value={editingCopy.filter}
                onChange={e => setEditingCopy({...editingCopy, filter: e.target.value})}
                placeHolder={'filter'}
            />
            <Button
                activeStyle={'active'}
                onClick={e => {
                    replaceValue(value, editingCopy, editingIndex)
                    setEditing(undefined)
                }}>
                save
            </Button>
        </div>
    )
}
const RenderOptions = ({attributeList, col, drivingAttribute, attr, value=[], dependsOn=[], updateAttribute, canEdit = true}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Input, Button} = UI;
    const [newOption, setNewOption] = useState('');
    const [editing, setEditing] = useState(undefined);
    const options = useMemo(() => (value || [])?.map(v => v.label ? v : ({label: v, value: v})), [value]);
    if(!['select', 'multiselect', 'radio'].includes(drivingAttribute)) return null;
    const addNewValue = (oldValue, newItem) => {
        const newValue =
            newItem?.label?.length ? [...(oldValue || []), newItem] :
                newItem?.length ? [...(oldValue || []), {label: newItem, value: newItem}] : oldValue;
        updateAttribute(col, {[attr]: newValue})
        setNewOption('')
    }

    const replaceValue = (oldValue, newItem, i) => {
        const newValue = oldValue.map((o, ii) => ii === i ? newItem : o);
        updateAttribute(col, {[attr]: newValue})
        setNewOption('')
    }

    const removeValue = (oldValue, itemToRemove) => {
        const newValue =  oldValue.filter(v => (v.value || v) !== (itemToRemove.value || itemToRemove))
        updateAttribute(col, {[attr]: newValue})
    }

    return (
        <div className={t.optionsWrapper}>
            <label className={t.labelUpperCase}>options</label>
            <div className={t.optionsInner}>
                {canEdit && <RenderAddForm {...{editing, Input, newOption, setNewOption, addNewValue, Button, value}} />}
                {canEdit && <RenderEditingForm key={editing} {...{editingIndex: editing, item: options[editing], setEditing, value, replaceValue}} />}

                <div className={t.optionsList}>
                    {
                        options?.map((option, optionI) => (
                            <div key={optionI} className={t.optionTag}>
                                <label className={t.optionTagLabel} onClick={() => canEdit && setEditing(optionI)}>{option?.label || option}</label>
                                {canEdit &&
                                    <div title={'remove'}
                                         className={t.optionRemove}
                                         onClick={e => removeValue(value, option)}
                                    >x</div>
                                }
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

const parseIfJSON = strValue => {
    if(typeof strValue === 'object') return strValue;
    try {
        return JSON.parse(strValue);
    }catch (e){
        return {}
    }
}
const RenderMappedOptions = ({col, drivingAttribute, attr, value='', updateAttribute, canEdit = true}) => {
    // {"viewId": "1346450", "sourceId": "1346449", "labelColumn": "municipality_name", "valueColumn": "geoid", "isDms": true, "type": "477b3e18-2b35-4e98-82f1-feb821ba4fc3"}
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const [newOption, setNewOption] = useState(parseIfJSON(value));
    const {FieldSet} = UI;
    const customTheme = {
        field: t.metadataFieldTheme
    }
    const inputKeys = [
        {key: 'sourceId', placeHolder: 'source id'},
        {key: 'viewId', placeHolder: 'view id'},
        {key: 'labelColumn', placeHolder: 'label column'},
        {key: 'valueColumn', placeHolder: 'value Column'},
        {key: 'type', placeHolder: 'type'}
    ]
    if(!['select', 'multiselect'].includes(drivingAttribute)) return null;
    return (
        <>
            <label className={t.labelUpperCase}>Options Map</label>
            <FieldSet
                className={t.mappedGrid}
                components={[
                    ...inputKeys.map(({key, placeHolder}) => (
                        {
                            type: 'Input', label: placeHolder, placeHolder, value: newOption[key] || '',
                            onChange: e => setNewOption({...newOption, [key]: e.target.value}),
                            customTheme
                        }
                    )),
                    {
                        label: 'Internally sourced',
                        type: 'Switch',
                        enabled: newOption.isDms,
                        size: 'small',
                        setEnabled: e => setNewOption({...newOption, isDms: e}),
                        className: 'self-center',
                        customTheme
                    },
                    {
                        type: 'Button', children: 'update', activeStyle: 'active', disabled: !canEdit,
                        onClick: () => {
                            canEdit && updateAttribute(col, {[attr]: JSON.stringify(newOption)});
                        }
                    },
                    {
                        type: 'Button', children: 'remove', activeStyle: 'danger', disabled: !canEdit,
                        onClick: () => {
                            if (!canEdit) return;
                            updateAttribute(col, {[attr]: undefined});
                            setNewOption({})
                        }
                    }
                ]}
            />
        </>
    )
}

const RenderRemoveBtn = ({col, removeAttribute, canEdit = true}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {theme} = React.useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const {Button, Modal} = UI;
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);

    if (!canEdit) return null;
    return (
        <div className={t.deleteWrapper}>
            <Modal open={showDeleteModal} setOpen={setShowDeleteModal} className={t.deleteModalBorder}>
                <div className={t.deleteTitle}>Confirm Delete</div>
                <div className={t.deleteMessage}>
                    Are you sure you want to delete column: <span className={'font-semibold'}>{col}</span>?
                <div>This action can not be undone.</div>
                </div>
                <Button
                    activeStyle={'danger'}
                    onClick={() => removeAttribute(col)}
                >
                    delete
                </Button>
            </Modal>
            <Button
                activeStyle={'danger'}
                onClick={() => setShowDeleteModal(true)}
            >
                delete
            </Button>
        </div>
    )
}

export const RenderField = ({isDms, i, item, attribute, attributeList=[], updateAttribute, removeAttribute, onSetIndex, pkeyInfo, onSetPrimaryKey, apiLoad, format, dragStart, dragEnter, dragOver, drop, canEdit = true}) => {
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
    const [showAdvanced, setShowAdvanced] = useState(false);
    return (
            <div key={i}
                 className={`${i % 2 ? t.fieldRowOdd : t.fieldRowEven} ${t.fieldRow}`}
                 onDragStart={(e) => canEdit && dragStart(e, i)}
                 onDragEnter={(e) => canEdit && dragEnter(e, i)}

                 onDragOver={dragOver}

                 onDragEnd={(e) => canEdit && drop(e)}
                 draggable={canEdit}
            >
                <div className={showAdvanced ? `${t.fieldHeader} bg-blue-50` : t.fieldHeader}>
                    {item.isIndex && <span className={t.pkBadge}>IDX</span>}
                    {!isDms && pkeyInfo?.hasPkey && pkeyInfo?.pkeyColumn === item.name && <span className={t.pkBadge}>PK</span>}
                    <div className={t.dragHandle}>
                        <svg data-v-4e778f45=""
                             className={t.dragHandleSvg}
                             viewBox="0 0 24 24" width="1.2em" height="1.2em">
                            <path fill="currentColor"
                                  d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                        </svg>
                    </div>
                    <div className={t.fieldControls}>
                        <RenderInputText
                            key={`${item.name}-name`}
                            disabled={true}
                            label={'name'}
                            attr={'name'}
                            value={attribute}
                            col={item.name}
                            // updateAttribute={updateAttribute}
                        />

                        <RenderInputText
                            key={`${item.name}-display_name`}
                            label={'display name'}
                            attr={'display_name'}
                            value={item.display_name}
                            col={item.name}
                            disabled={!canEdit}
                            updateAttribute={updateAttribute}
                        />

                        <RenderInputSelect
                            disabled={!canEdit || (!isDms && item.display !== 'calculated' && item.origin !== 'calculated-column')}
                            key={`${item.name}-type`}
                            label={'Column Type'}
                            value={item.type}
                            col={item.name}
                            attr={'type'}
                            options={fieldTypes}
                            updateAttribute={updateAttribute}
                        />

                        <div title={'Advanced Settings'}
                             className={t.advancedToggle}
                             onClick={() => setShowAdvanced(!showAdvanced)}
                        >...
                        </div>
                    </div>
                </div>

                <div className={showAdvanced ? t.advancedPanel : 'hidden'}>
                    <div className={`flex flex-row justify-between p-4 bg-blue-50 items-center`}>
                        <RenderIndexSwitch
                            key={`${item.name}-index`}
                            value={item.isIndex}
                            col={item.name}
                            onSetIndex={onSetIndex}
                            disabled={!canEdit}
                        />
                        {!isDms && onSetPrimaryKey &&
                            <RenderPrimaryKeySwitch
                                key={`${item.name}-primary-key`}
                                item={item}
                                col={item.name}
                                pkeyInfo={pkeyInfo}
                                onSetPrimaryKey={onSetPrimaryKey}
                                canEdit={canEdit}
                            />
                        }
                        <RenderInputSwitch
                            key={`${item.name}-required`}
                            label={'Required'}
                            value={item.required}
                            trueValue={'yes'}
                            col={item.name}
                            attr={'required'}
                            updateAttribute={updateAttribute}
                            disabled={!canEdit}
                        />
                        <RenderInputButtonSelect
                            key={`${item.name}-display`}
                            label={'Behaviour Type'}
                            value={!isDms && item.meta_lookup ? 'meta' : item.display}
                            col={item.name}
                            attr={'display'}
                            options={item.type  === 'calculated' ? [{value: 'calculated', label: 'calculated'}] : behaviourTypes} // don't rely on user selecting display. even if type is calculated, consider the column to be calculated.
                            updateAttribute={updateAttribute}
                            placeHolder={'Please select behaviour type'}
                            disabled={!canEdit}
                        />

                        <RenderInputButtonSelect
                            key={`${item.name}-defaultFn`}
                            label={'Default Fn'}
                            value={item.defaultFn}
                            col={item.name}
                            attr={'defaultFn'}
                            options={defaultFnTypes}
                            updateAttribute={updateAttribute}
                            disabled={!canEdit}
                        />

                        <RenderInputButtonSelect
                            key={`${item.name}-data-type`}
                            label={'Sort as'}
                            value={item.dataType}
                            col={item.name}
                            attr={'dataType'}
                            options={dataTypes}
                            updateAttribute={updateAttribute}
                            disabled={!canEdit}
                        />
                        <RenderInputText
                            key={`${item.name}-trueValue`}
                            label={'Checked Value'}
                            attr={'trueValue'}
                            value={item.trueValue}
                            col={item.name}
                            updateAttribute={updateAttribute}
                            hidden={!['checkbox', 'switch'].includes(item.type)}
                            disabled={!canEdit}
                        />
                    </div>
                    <div className={t.advancedDescRow}>
                        <RenderInputLexical
                            key={`${item.name}-description`}
                            label={'description'}
                            attr={'desc'}
                            value={item.desc || item.description}
                            col={item.name}
                            // readers are split between `desc` (dama convention) and
                            // `description` — keep both keys in sync on write
                            updateAttribute={(col, val) => updateAttribute(col, { desc: val.desc, description: val.desc })}
                        />
                    </div>
                    {/*<RenderInputText*/}
                    {/*    key={`${item.name}-prompt`}*/}
                    {/*    label={'prompt'}*/}
                    {/*    attr={'prompt'}*/}
                    {/*    value={item.prompt}*/}
                    {/*    col={item.name}*/}
                    {/*    updateAttribute={updateAttribute}*/}
                    {/*/>*/}
                    <RenderOptions key={`${item.name}-options`}
                                   col={item.name}
                                   attributeList={attributeList}
                                   drivingAttribute={item.type}
                                   value={item.options}
                                   dependsOn={item.depends_on}
                                   attr={'options'}
                                   updateAttribute={updateAttribute}
                                   canEdit={canEdit}
                    />
                    <RenderMappedOptions key={`${item.name}-mapped-options`} col={item.name} drivingAttribute={item.type} value={item.mapped_options} attr={'mapped_options'} updateAttribute={updateAttribute} canEdit={canEdit}/>
                    <Metadata key={`${item.name}-meta_lookup`} col={item.name} drivingAttribute={!isDms && item.meta_lookup ? 'meta' : item.display} value={item.meta_lookup} attr={'meta_lookup'} updateAttribute={updateAttribute} canEdit={canEdit}/>
                    <RenderRemoveBtn key={`${item.name}-removeBtn`} col={item.name} removeAttribute={removeAttribute} canEdit={canEdit}/>

                </div>
            </div>);
}
