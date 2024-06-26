import React, {useMemo, useState} from "react";
import Lexical from "../../lexical";

const fieldTypes = {
    // value: label
    'text': 'text',
    'textarea': 'text area',
    'select': 'dropdown',
    'multiselect': 'dropdown (multiple choice)',
    'lexical': 'rich text',
    'radio': 'radio'
}

const behaviourTypes = {
    'data': 'Simple Data',
    'meta': 'Group-able/Meta',
    'fips': 'fips',
    'geoid': 'geoid'
}

const defaultFnTypes = {
    'sum': 'Sum',
    'list': 'List',
    'count': 'Count',
}

const labelClass = 'font-light capitalize font-gray-700';
const inputClass = 'w-full border p-2 rounded-md'

const RenderInputText = ({label, value, col, attr, updateAttribute}) => {
    const [newValue, setNewValue] = useState(value);

    const delayedUpdate = (val) => setTimeout(updateAttribute(col, {[attr]: val}), 500);

    return (
        <div className={'flex flex-col items-start'}>
            <label className={labelClass}>{label}</label>
            <input
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
        const newValue = newItem?.label ? [...oldValue, newItem] : [...oldValue, {label: newItem, value: newItem}]
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
                        className='bg-white p-2 flex-1 px-2 shadow bg-blue-100 focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-none rounded-md'
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
                        options.map(option => (
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

const RenderInputSelect = ({className, label, value, col, attr, updateAttribute, placeholder, options}) => (
    <div className={'flex flex-col items-start'}>
        <label className={labelClass}>{label}</label>
        <select
            className={className || 'border p-2 rounded-md bg-white'}
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

const RenderRemoveBtn = ({col, removeAttribute}) => {
    const [timerId, setTimerId] = useState(undefined);

    const delayedRemove = () => {
        setTimerId(undefined)
        removeAttribute(col)
    }
    return (
        <div className={'w-full'}>
            <button
                className={`${timerId ? `bg-blue-300 hover:bg-blue-500` : `bg-red-300 hover:bg-red-500`} w-fit p-1 m-2 text-white float-right`}
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

export const RenderField = ({i, theme, item, attribute, placeholder, className, updateAttribute, removeAttribute}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    return (
        Array.isArray(item[attribute]) ?
            <div>{
                item[attribute].map((item, i) => <RenderField i={i} item={item} placeholder={placeholder}
                                                              attribute={item?.name}
                                                              theme={theme} updateAttribute={updateAttribute}
                                                              removeAttribute={removeAttribute}/>)
            }</div> :
            <div
                className={`${i % 2 ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-100 border-l-4 border-blue-100 hover:border-blue-300 mb-1 px-2 pb-2 w-full flex flex-col`}>
                <div className={'flex flex-wrap justify-between flex-col sm:flex-row items-center'}>
                    <RenderInputText
                        label={'name'}
                        attr={'name'}
                        value={attribute}
                        col={item.name}
                        updateAttribute={updateAttribute}
                    />

                    <RenderInputText
                        label={'display name'}
                        attr={'display_name'}
                        value={item.display_name}
                        col={item.name}
                        updateAttribute={updateAttribute}
                    />

                    <RenderInputSelect
                        label={'Input Type'}
                        className={className || theme?.text?.input}
                        value={item.type}
                        col={item.name}
                        attr={'type'}
                        options={fieldTypes}
                        updateAttribute={updateAttribute}
                    />

                    <div title={'Advanced Settings'}
                         className={'cursor-pointer p-2 text-gray-500 hover:text-gray-900 text-xl'}
                         onClick={() => setShowAdvanced(!showAdvanced)}
                    >...
                    </div>
                </div>

                <div className={showAdvanced ? 'flex flex-col' : 'hidden'}>
                    <div className={'flex flex-row justify-between items-center'}>
                        <RenderInputLexical
                            label={'description'}
                            attr={'description'}
                            value={item.description}
                            col={item.name}
                            updateAttribute={updateAttribute}
                        />
                        <div className={'flex flex-col'}>
                            <RenderInputSelect
                                label={'Behaviour Type'}
                                className={className || theme?.text?.input}
                                value={item.display}
                                col={item.name}
                                attr={'display'}
                                options={behaviourTypes}
                                updateAttribute={updateAttribute}
                                placeholder={'Please select behaviour type'}
                            />

                            <RenderInputSelect
                                label={'Default Fn'}
                                className={className || theme?.text?.input}
                                value={item.defaultFn}
                                col={item.name}
                                attr={'defaultFn'}
                                options={defaultFnTypes}
                                updateAttribute={updateAttribute}
                                placeholder={'Please select default function'}
                            />
                        </div>
                    </div>
                    <RenderOptions col={item.name} drivingAttribute={item.type} value={item.options} attr={'options'} updateAttribute={updateAttribute}/>
                    <RenderMeta col={item.name} drivingAttribute={item.display} value={item.meta_lookup} attr={'meta_lookup'} updateAttribute={updateAttribute}/>
                    <RenderRemoveBtn col={item.name} removeAttribute={removeAttribute}/>

                </div>
            </div>);
}