import React, {useMemo, useState} from "react";
import {FormsContext} from "../../../../siteConfig";
import {Metadata} from "./Metadata";

const Lexical = { EditComp: () => <div/>}

const fieldTypes = [
    { value: 'text', label: 'text' },
    { value: 'textarea', label: 'text area' },
    { value: 'lexical', label: 'rich text' },
    { value: 'number', label: 'number', dataType: 'numeric' },
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

const labelClass = 'text-sm font-light capitalize font-gray-700';

const RenderInputText = ({label, value, col, attr, disabled, hidden, updateAttribute}) => {
    const {UI} = React.useContext(FormsContext);
    const {Input} = UI;
    const [newValue, setNewValue] = useState(value);

    const delayedUpdate = (val) => setTimeout(updateAttribute(col, {[attr]: val}), 500);
    if(hidden) return null;
    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
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

const RenderInputSelect = ({label, value='', col, attr, updateAttribute, placeHolder='please select...', options}) => {
    const {UI} = React.useContext(FormsContext);
    const {Select} = UI;

    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
            <Select
                value={value}
                onChange={e => {
                    const valueToUpdate = {[attr]: e.target.value};
                    if(attr === 'type') {
                        valueToUpdate['dataType'] = options.find(o => o.value === e.target.value)?.dataType || undefined;

                    }
                    updateAttribute(col, valueToUpdate)
                }}
                options={[{label: placeHolder, value: undefined}, ...options]}
            />
        </div>
    )
}


const RenderInputSwitch = ({label, value='', col, attr, updateAttribute, trueValue=true}) => {
    const {UI} = React.useContext(FormsContext);
    const {Switch} = UI;

    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
            <Switch
                enabled={value === trueValue}
                setEnabled={e => updateAttribute(col, {[attr]: e ? trueValue : false})}
                size={'small'}
            />
        </div>
    )
}

const RenderInputButtonSelect = ({label, value='', col, attr, updateAttribute, options}) => {
    const {UI} = React.useContext(FormsContext);
    const {ButtonSelect} = UI;

    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
            <ButtonSelect
                value={value}
                options={options}
                onChange={e => updateAttribute(col, {[attr]: e})}
            />
        </div>
    )
}

const RenderInputLexical = ({label, value, col, attr, updateAttribute}) => (
    <div className={'flex flex-col items-start'}>
        <label className={labelClass}>{label}</label>
        <Lexical.EditComp
            value={value}
            bgColor={'#ffffff'}
            onChange={e => {
                updateAttribute(col, {[attr]: e})
            }}
            placeHolder={label}
        />
    </div>
)

const RenderAddForm = ({editing, newOption, setNewOption, addNewValue, value}) => {
    const {UI} = React.useContext(FormsContext);
    const {Input, Button} = UI;

    if(editing !== undefined) return null;
    return (
        <div className={'w-full flex'}>
            <Input
                value={newOption}
                onChange={e => {
                    setNewOption(e.target.value)
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addNewValue(value, newOption)
                    }
                }}
                placeHolder={'Add new option...'}
            />
            <Button
                className={'p-2'}
                onClick={e => addNewValue(value, newOption)}>
                add
            </Button>
        </div>
    )
}

const RenderEditingForm = ({editingIndex, item, setEditing, value, replaceValue}) => {
    if(editingIndex === undefined) return null;

    const {UI} = React.useContext(FormsContext);
    const {Input, Textarea, Button} = UI;
    const [editingCopy, setEditingCopy] = useState(item); // using prop as state is fine since uniq key is used to render this component.

    return (
        <div className={'w-full flex'}>
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
                className={'p-2'}
                onClick={e => {
                    replaceValue(value, editingCopy, editingIndex)
                    setEditing(undefined)
                }}>
                save
            </Button>
        </div>
    )
}
const RenderOptions = ({attributeList, col, drivingAttribute, attr, value=[], dependsOn=[], updateAttribute}) => {
    const {UI} = React.useContext(FormsContext);
    const {Input, Button} = UI;
    const [newOption, setNewOption] = useState('');
    const [editing, setEditing] = useState(undefined);
    const options = useMemo(() => (value || [])?.map(v => v.label ? v : ({label: v, value: v})), [value]);
    if(!['select', 'multiselect', 'radio'].includes(drivingAttribute)) return null;
    const addNewValue = (oldValue, newItem) => {
        const newValue = newItem?.label ? [...(oldValue || []), newItem] : [...(oldValue || []), {label: newItem, value: newItem}]
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
        <div className={'flex flex-col items-start w-full gap-1'}>
            <label className={labelClass}>Options</label>
            {/*<div className={'flex flex-row gap-1 items-center'}>
                <label className={labelClass}>Depends on:</label>
                <select
                    value={dependsOn?.[0]}
                    onChange={e => updateAttribute(col, {['depends_on']: [e.target.value]})}
                    className={'bg-white p-2 flex-1 px-2 shadow focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-md\''}
                >
                    <option>N/A</option>
                    {
                        attributeList.map(name => <option key={name} value={name}>{name}</option>)
                    }
                </select>
            </div>*/}
            <div className={'w-full flex flex-col'}>
                <RenderAddForm {...{editing, Input, newOption, setNewOption, addNewValue, Button, value}} />
                <RenderEditingForm key={editing} {...{editingIndex: editing, item: options[editing], setEditing, value, replaceValue}} />

                <div className={'flex flex-row flex-wrap'}>
                    {
                        options?.map((option, optionI) => (
                            <div key={optionI} className={'bg-red-500 hover:bg-red-700 text-white text-xs font-semibold px-1.5 py-1 m-1 flex no-wrap items-center rounded-md'}>
                                <label className={'hover:cursor-pointer'} onClick={() => setEditing(optionI)}>{option?.label || option}</label>
                                <div title={'remove'}
                                     className={'p-0.5 px-1 cursor-pointer'}
                                     onClick={e => removeValue(value, option)}
                                >x</div>
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
const RenderMappedOptions = ({col, drivingAttribute, attr, value='', updateAttribute}) => {
    // {"viewId": "1346450", "sourceId": "1346449", "labelColumn": "municipality_name", "valueColumn": "geoid", "isDms": true, "type": "477b3e18-2b35-4e98-82f1-feb821ba4fc3"}
    const {UI} = React.useContext(FormsContext);
    const [newOption, setNewOption] = useState(parseIfJSON(value));
    const {FieldSet} = UI;
    const customTheme = {
        field: 'pb-2 flex flex-col'
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
            <label className={labelClass}>Options Map</label>
            <FieldSet
                className={'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-1'}
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
                        type: 'Button', children: 'update',
                        onClick: () => {
                            updateAttribute(col, {[attr]: JSON.stringify(newOption)});
                        }
                    },
                    {
                        type: 'Button', children: 'remove',
                        onClick: () => {
                            updateAttribute(col, {[attr]: undefined});
                            setNewOption({})
                        }
                    }
                ]}
            />
        </>
    )
    return (
        <div className={'flex flex-col items-start w-full'}>

            <div className={'w-full flex flex-col'}>
                <div className={'w-full flex'}>
                    <Input
                        // className='bg-white p-2 flex-1 px-2 shadow focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-md'
                        value={newOption}
                        onChange={e => setNewOption(e.target.value)}
                        placeHolder={'Add a mapping...'}
                    />
                </div>
            </div>
        </div>
    )
}

const RenderRemoveBtn = ({col, removeAttribute}) => {
    const {UI} = React.useContext(FormsContext);
    const {Button, Modal} = UI;
    const [showDeleteModal, setShowDeleteModal] = React.useState(false);

    return (
        <div className={'w-full text-end'}>
            <Modal open={showDeleteModal} setOpen={setShowDeleteModal} className={'border border-red-500'}>
                <div className={'text-lg font-medium text-gray-900'}>Confirm Delete</div>
                <div className={'text-md font-medium text-gray-900 py-4 px-2'}>
                    Are you sure you want to delete column: <span className={'font-semibold'}>{col}</span>?
                <div>This action can not be undone.</div>
                </div>
                <Button
                    className={'bg-red-500 text-red-900'}
                    onClick={() => removeAttribute(col)}
                >
                    delete
                </Button>
            </Modal>
            <Button
                className={'bg-red-500 text-red-900'}
                onClick={() => setShowDeleteModal(true)}
            >
                delete
            </Button>
        </div>
    )
}

export const RenderField = ({i, item, attribute, attributeList=[], updateAttribute, removeAttribute, apiLoad, format, dragStart, dragEnter, dragOver, drop}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    return (
            <div key={i}
                 className={`${i % 2 ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 border-l-4 border-blue-100 hover:border-blue-300 mb-1 px-2 pb-2 w-full flex flex-col`}
                 onDragStart={(e) => dragStart(e, i)}
                 onDragEnter={(e) => dragEnter(e, i)}

                 onDragOver={dragOver}

                 onDragEnd={drop}
                 draggable={true}
            >
                <div className={'flex items-center w-full gap-2'}>
                    <div className={'h-4 w-4 m-1 text-gray-800'}>
                        <svg data-v-4e778f45=""
                             className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                             viewBox="0 0 24 24" width="1.2em" height="1.2em">
                            <path fill="currentColor"
                                  d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                        </svg>
                    </div>
                    <div className={'w-full flex flex-wrap justify-between flex-col sm:flex-row items-stretch sm:items-center'}>
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
                            updateAttribute={updateAttribute}
                        />

                        <RenderInputSelect
                            key={`${item.name}-type`}
                            label={'Column Type'}
                            value={item.type}
                            col={item.name}
                            attr={'type'}
                            options={fieldTypes}
                            updateAttribute={updateAttribute}
                        />
                        <RenderInputSwitch
                            key={`${item.name}-required`}
                            label={'Required'}
                            value={item.required}
                            trueValue={'yes'}
                            col={item.name}
                            attr={'required'}
                            updateAttribute={updateAttribute}
                        />
                        <RenderInputButtonSelect
                            key={`${item.name}-display`}
                            label={'Behaviour Type'}
                            value={item.display}
                            col={item.name}
                            attr={'display'}
                            options={item.type  === 'calculated' ? [{value: 'calculated', label: 'calculated'}] : behaviourTypes} // don't rely on user selecting display. even if type is calculated, consider the column to be calculated.
                            updateAttribute={updateAttribute}
                            placeHolder={'Please select behaviour type'}
                        />

                        <RenderInputButtonSelect
                            key={`${item.name}-defaultFn`}
                            label={'Default Fn'}
                            value={item.defaultFn}
                            col={item.name}
                            attr={'defaultFn'}
                            options={defaultFnTypes}
                            updateAttribute={updateAttribute}
                        />

                        <RenderInputButtonSelect
                            key={`${item.name}-data-type`}
                            label={'Sort as'}
                            value={item.dataType}
                            col={item.name}
                            attr={'dataType'}
                            options={dataTypes}
                            updateAttribute={updateAttribute}
                        />
                        <div title={'Advanced Settings'}
                             className={'cursor-pointer p-2 text-gray-500 hover:text-gray-900 text-xl'}
                             onClick={() => setShowAdvanced(!showAdvanced)}
                        >...
                        </div>
                    </div>
                </div>

                <div className={showAdvanced ? 'flex flex-col' : 'hidden'}>
                    <div className={'flex flex-row justify-between items-center'}>
                        <RenderInputLexical
                            key={`${item.name}-description`}
                            label={'description'}
                            attr={'description'}
                            value={item.description}
                            col={item.name}
                            updateAttribute={updateAttribute}
                        />
                        <div className={'flex flex-col'}>

                        </div>
                    </div>
                    <RenderInputText
                        key={`${item.name}-prompt`}
                        label={'prompt'}
                        attr={'prompt'}
                        value={item.prompt}
                        col={item.name}
                        updateAttribute={updateAttribute}
                    />
                    <RenderInputText
                        key={`${item.name}-trueValue`}
                        label={'Checked Value'}
                        attr={'trueValue'}
                        value={item.trueValue}
                        col={item.name}
                        updateAttribute={updateAttribute}
                        hidden={!['checkbox', 'switch'].includes(item.type)}
                    />
                    <RenderOptions key={`${item.name}-options`}
                                   col={item.name}
                                   attributeList={attributeList}
                                   drivingAttribute={item.type}
                                   value={item.options}
                                   dependsOn={item.depends_on}
                                   attr={'options'}
                                   updateAttribute={updateAttribute}
                    />
                    <RenderMappedOptions key={`${item.name}-mapped-options`} col={item.name} drivingAttribute={item.type} value={item.mapped_options} attr={'mapped_options'} updateAttribute={updateAttribute}/>
                    <Metadata key={`${item.name}-meta_lookup`} col={item.name} drivingAttribute={item.display} value={item.meta_lookup} attr={'meta_lookup'} updateAttribute={updateAttribute}/>
                    <RenderRemoveBtn key={`${item.name}-removeBtn`} col={item.name} removeAttribute={removeAttribute}/>

                </div>
            </div>);
}