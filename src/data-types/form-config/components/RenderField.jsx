import React, {useEffect, useMemo, useState} from "react";
const Lexical = { EditComp: () => <div/>}

const fieldTypes = {
    // value: label
    'text': 'text',
    'textarea': 'text area',
    'select': 'dropdown',
    'multiselect': 'dropdown (multiple choice)',
    'lexical': 'rich text',
    'radio': 'radio',
    'calculated': 'calculated' // can't be inputted, always calculated. don't use data->> to access.
}

const dataTypes = {
    numeric: 'Numeric',
    text: 'Text',
    date: 'Date',
    timestamp: 'Timestamp'
}

const behaviourTypes = {
    'data': 'Simple Data',
    'meta': 'Group-able/Meta',
    'fips': 'fips',
    'geoid': 'geoid',
    'calculated': 'calculated'
}

const defaultFnTypes = {
    'sum': 'Sum',
    'list': 'List',
    'count': 'Count',
}

const defaultReqTypes = {
    'yes': 'Yes',
    'no': 'No'
}

const labelClass = 'text-sm font-light capitalize font-gray-700';
const inputClass = 'bg-white w-full border p-2 rounded-md'

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const RenderInputText = ({label, value, col, attr, disabled, updateAttribute}) => {
    const [newValue, setNewValue] = useState(value);

    const delayedUpdate = (val) => setTimeout(updateAttribute(col, {[attr]: val}), 500);

    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
            <input
                disabled={disabled}
                className={inputClass}
                value={newValue}
                placeholder={label}
                onChange={e => {
                    setNewValue(e.target.value)
                    delayedUpdate(e.target.value)
                }}
            />
        </div>
    )
}

const RenderInputSelect = ({label, value, col, attr, updateAttribute, placeholder, options}) => (
    <div className={'flex flex-col items-start'}>
        <label className={labelClass}>{label}</label>
        <select
            className={inputClass}
            value={value}
            onChange={e => {
                // onChange(e.target.value)
                updateAttribute(col, {[attr]: e.target.value})
            }}
        >
            <option>{placeholder}</option>
            {
                Object.keys(options).map(value => <option key={value} value={value}>{options[value]}</option>)
            }
        </select>
    </div>
)

const RenderInputLexical = ({label, value, col, attr, updateAttribute}) => (
    <div className={'flex flex-col items-start'}>
        <label className={labelClass}>{label}</label>
        <Lexical.EditComp
            value={value}
            bgColor={'#ffffff'}
            onChange={e => {
                updateAttribute(col, {[attr]: e})
            }}
            placeholder={label}
        />
    </div>
)

const RenderOptions = ({col, drivingAttribute, attr, value=[], updateAttribute}) => {
    if(!['select', 'multiselect', 'radio'].includes(drivingAttribute)) return null;

    const [newOption, setNewOption] = useState(undefined);
    const options = useMemo(() => value?.map(v => v.label ? v : ({label: v, value: v})), [value]);

    const addNewValue = (oldValue, newItem) => {
        const newValue = newItem?.label ? [...(oldValue || []), newItem] : [...(oldValue || []), {label: newItem, value: newItem}]
        updateAttribute(col, {[attr]: newValue})
        setNewOption('')
    }

    const removeValue = (oldValue, itemToRemove) => {
        const newValue =  oldValue.filter(v => (v.value || v) !== (itemToRemove.value || itemToRemove))
        updateAttribute(col, {[attr]: newValue})
    }

    return (
        <div className={'flex flex-col items-start w-full'}>
            <label className={labelClass}>Options</label>

            <div className={'w-full flex flex-col'}>
                <div className={'w-full flex'}>
                    <input
                        className='bg-white p-2 flex-1 px-2 shadow focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-md'
                        value={newOption}
                        onChange={e => setNewOption(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addNewValue(value, newOption)}
                        placeholder={'Add new option...'}
                    />
                    <button
                        className={'p-2'}
                        onClick={e => addNewValue(value, newOption)}>
                        add
                    </button>
                </div>
                <div className={'flex flex-row flex-wrap'}>
                    {
                        options?.map(option => (
                            <div className={'bg-red-500 hover:bg-red-700 text-white text-xs font-semibold px-1.5 py-1 m-1 flex no-wrap items-center rounded-md'}>
                                {option?.label || option}
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

const RenderMappedOptions = ({col, drivingAttribute, attr, value='', updateAttribute}) => {
    if(!['select', 'multiselect'].includes(drivingAttribute)) return null;
    // {viewId: "1346450", sourceId: "1346449", labelColumn: "municipality_name", valueColumn: "geoid", isDms: true}
    const [newOption, setNewOption] = useState(value || '');

    useEffect(() => {
        let isStale = false;

        setTimeout(() => {
            if(!isStale && value !== newOption){
                updateAttribute(col, {[attr]: newOption})
            }
        }, 300)
        return () => {
            isStale = true;
        }
    }, [newOption])
    console.log('????????????', value, newOption)
    return (
        <div className={'flex flex-col items-start w-full'}>
            <label className={labelClass}>Options Map</label>

            <div className={'w-full flex flex-col'}>
                <div className={'w-full flex'}>
                    <input
                        className='bg-white p-2 flex-1 px-2 shadow focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-md'
                        value={newOption}
                        onChange={e => setNewOption(e.target.value)}
                        placeholder={'Add a mapping...'}
                    />
                </div>
            </div>
        </div>
    )
}

const RenderMeta = ({value, col, drivingAttribute, attr, updateAttribute}) =>
    drivingAttribute === 'meta' ? (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>Meta Lookup</label>
            <textarea
                className={inputClass}
                value={value}
                placeholder={'Please enter meta lookup if available'}
                onChange={e => {
                    updateAttribute(col, {[attr]: e.target.value})
                }}
            />
        </div>) : null;

const RenderRemoveBtn = ({col, removeAttribute}) => {
    const [timerId, setTimerId] = useState(undefined);

    const delayedRemove = () => {
        setTimerId(undefined)
        removeAttribute(col)
    }
    return (
        <div className={'w-full'}>
            <button
                className={`${timerId ? `bg-blue-300 hover:bg-blue-500` : `bg-red-300 hover:bg-red-500`} w-fit p-1 m-2 text-white float-right rounded-md`}
                onClick={() => {
                    if (timerId) {
                        clearTimeout(timerId)
                        setTimerId(undefined)
                    } else {
                        const timerId = setTimeout(delayedRemove, 1500);
                        setTimerId(timerId)
                    }
                }}
            >
                {timerId ? 'undo' : 'remove'}
            </button>
        </div>
    )
}

export const RenderField = ({i, item, attribute, updateAttribute, removeAttribute, apiLoad, format, dragStart, dragEnter, dragOver, drop}) => {
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
                    <div className={'w-full flex flex-wrap justify-between flex-col sm:flex-row items-center'}>
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
                            label={'Input Type'}
                            value={item.type}
                            col={item.name}
                            attr={'type'}
                            options={fieldTypes}
                            updateAttribute={updateAttribute}
                        />

                        <RenderInputSelect
                            key={`${item.name}-data-type`}
                            label={'Data Type'}
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
                            <RenderInputSelect
                                key={`${item.name}-display`}
                                label={'Behaviour Type'}
                                value={item.display}
                                col={item.name}
                                attr={'display'}
                                options={item.type  === 'calculated' ? {'calculated': 'calculated'} : behaviourTypes} // don't rely on user selecting display. even if type is calculated, consider the column to be calculated.
                                updateAttribute={updateAttribute}
                                placeholder={'Please select behaviour type'}
                            />

                            <RenderInputSelect
                                key={`${item.name}-defaultFn`}
                                label={'Default Fn'}
                                value={item.defaultFn}
                                col={item.name}
                                attr={'defaultFn'}
                                options={defaultFnTypes}
                                updateAttribute={updateAttribute}
                                placeholder={'Please select default function'}
                            />

                            <RenderInputSelect
                                key={`${item.name}-required`}
                                label={'Required'}
                                value={item.required}
                                col={item.name}
                                attr={'required'}
                                options={defaultReqTypes}
                                updateAttribute={updateAttribute}
                                placeholder={'Please select property'}
                            />
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
                    <RenderOptions key={`${item.name}-options`} col={item.name} drivingAttribute={item.type} value={item.options} attr={'options'} updateAttribute={updateAttribute}/>
                    <RenderMappedOptions key={`${item.name}-mapped-options`} col={item.name} drivingAttribute={item.type} value={item.mapped_options} attr={'mapped_options'} updateAttribute={updateAttribute}/>
                    <RenderMeta key={`${item.name}-meta_lookup`} col={item.name} drivingAttribute={item.display} value={item.meta_lookup} attr={'meta_lookup'} updateAttribute={updateAttribute}/>
                    <RenderRemoveBtn key={`${item.name}-removeBtn`} col={item.name} removeAttribute={removeAttribute}/>

                </div>
            </div>);
}