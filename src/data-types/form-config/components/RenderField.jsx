import React, {useEffect, useMemo, useState} from "react";
import Lexical from "../../lexical";
import {isJson} from "../../../../../../utils/macros";
import {dmsDataTypes} from "../../index";

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

export const getData = async ({format, apiLoad, length}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = isJson(format?.config) ? (format.config?.attributes || []) :
                                    JSON.parse(format?.config || '{}')?.attributes || [];
    const fromIndex = 0;
    const toIndex = length-1;
    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({}),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
    return data;
}

export const getValues = async ({format, apiLoad, length, attributes, groupBy=[]}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const finalAttributes = attributes || (
                                        isJson(format?.config) ? (format.config?.attributes || []) :
                                            JSON.parse(format?.config || '{}')?.attributes || []
                                        );
    const fromIndex = 0;
    const toIndex = length-1;
    const children = [{
        type: () => {
        },
        action: 'load',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({groupBy, aggregatedLen: groupBy.length}),
            attributes: finalAttributes,
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: finalAttributes,
        children
    });
    return data;
}

export const getLength = async ({format, apiLoad, groupBy= []}) =>{
    const finalAttributes = isJson(format?.config) ? (format.config?.attributes || []) :
                                        JSON.parse(format?.config || '{}')?.attributes || [];

    const children = [{
        type: () => {
        },
        action: 'filteredLength',
        path: '/',
        filter: {
            options: JSON.stringify({groupBy, aggregatedLen: groupBy.length})
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: finalAttributes,
        children
    });
    return length;
}

const RenderMappings = ({col, drivingAttribute, attr, value=[], updateAttribute, apiLoad, format}) => {
    const [adding, setAdding] = useState(false);
    const [formats, setFormats] = useState([]);
    const [mapping, setMapping] = useState({}); // selectedFormat, selectedAttribute, mappedValues
    const [targetValues, setTargetValues] = useState([]);
    const [srcValues, setSrcValues] = useState([]);
    const [editingIndex, setEditingIndex] = useState();

    const MultiSelectComp = dmsDataTypes.multiselect.EditComp;
    const valueClasses = 'p-1 truncate';

    // ============================================ get formats ========================================================
    useEffect(() => {
        async function load(){
            const length = await getLength({format: {...format, app: 'dms-site', type: 'forms-config'}, apiLoad});
            const data = await getData({
                format: {...format, app: 'dms-site', type: 'forms-config'},
                apiLoad,
                length
            })
            setFormats(data.map(d => ({...d, config: JSON.parse(d.config || '{}')})));
        }

        load()
    }, []);
    // ============================================ get formats end ====================================================

    // ============================================ get src values =====================================================
    useEffect(() => {
        async function load(){
            if(!adding) return;
            const formattedAttribute = `data->>'${col}' as ${col}`;
            const length = await getLength({format, apiLoad, groupBy: [`data->>'${col}'`]});

            const data = await getValues({
                format,
                apiLoad,
                length,
                attributes: [formattedAttribute],
                groupBy: [`data->>'${col}'`]
            })

            setSrcValues(data?.map(d => d[formattedAttribute]).filter(d => typeof d !== "object"));
        }

        load()
    }, [adding]);
    // ============================================ get src values end==================================================

    // ============================================ get target values ==================================================
    useEffect(() => {
        async function load(){
            if(!mapping.selectedFormat || !mapping.selectedAttribute) return;
            const formattedAttribute = `data->>'${mapping.selectedAttribute}' as ${mapping.selectedAttribute}`;
            const length = await getLength({format: mapping.selectedFormat.config, apiLoad, groupBy: [`data->>'${mapping.selectedAttribute}'`]});

            const data = await getValues({
                format: mapping.selectedFormat.config,
                apiLoad,
                length,
                attributes: [formattedAttribute],
                groupBy: [`data->>'${mapping.selectedAttribute}'`]
            })

            setTargetValues(data?.map(d => d[formattedAttribute]));
        }

        load()
    }, [mapping.selectedAttribute]);
    // ============================================ get target values end ==============================================

    return (
        <div>
            meta mappings
            <div className={'w-full grid grid-cols-6 border-t-2 border-gray-300 rounded-md'}>
                {
                    ['#', 'Source Values', 'Target Data Type', 'Target Column', 'Target Values', 'Actions'].map(attribute => (
                        <div className={'p-1'}>{attribute}</div>
                    ))
                }
            </div>
            {
                value.map((v, i) => (
                    <div className={'w-full grid grid-cols-6 border-2 border-gray-300 rounded-md items-center font-semibold justify-between hover:bg-blue-200'}>
                        <div className={`${valueClasses} text-xs`}>Mapping {i + 1}</div>
                        <div className={valueClasses}>{v.srcValues?.length || 0} source values</div>
                        <div className={valueClasses}>{v.selectedFormat.name}</div>
                        <div className={valueClasses}>{v.selectedAttribute}</div>
                        <div className={valueClasses}>{v.mappedValues.length} mapped values</div>
                        <div className={'p-1'}>
                            <button className={'bg-blue-300 hover:bg-blue-500 text-white text-sm p-1 rounded-md'}
                                    onClick={() => {
                                        setMapping(v)
                                        setEditingIndex(i)
                                        setAdding(true)
                                    }}>edit
                            </button>
                            <button className={'bg-red-300 hover:bg-red-500 text-white text-sm p-1 rounded-md'}
                                    onClick={() => updateAttribute(col, {[attr]: value.filter((v, vI) => vI !== i)})}>remove
                            </button>
                        </div>
                    </div>
                ))
            }

            {
                adding ? (
                    <div className={'flex flex-col items-start'}>
                        <button className={'bg-red-300 hover:bg-red-500 text-white text-sm p-1 rounded-md'}
                                onClick={() => setAdding(false)}>done
                        </button>
                        <div className={`grid grid-cols-6 w-full items-start`}>
                            <div className={'p-1 text-xs'}>Mapping {value?.length + 1}</div>

                            <MultiSelectComp
                                className={`border rounded-md bg-white h-full ${mapping.srcValues?.length ? `p-1` : `p-4`}`}
                                placeholder={'Please select values...'}
                                value={mapping.srcValues}
                                onChange={e => {
                                    setMapping({...mapping, srcValues: e})
                                }}
                                options={srcValues}
                                displayInvalidMsg={false}
                            />

                            <select
                                className={'border p-2 rounded-md bg-white'}
                                value={mapping.selectedFormat?.config?.type}
                                onChange={e => {
                                    setMapping({
                                        ...mapping,
                                        selectedFormat: formats.find(f => f.config.type === e.target.value)
                                    })
                                }}
                            >
                                <option>{'Please select a format'}</option>
                                {
                                    formats.map(value => <option key={value.config.type}
                                                                 value={value.config.type}>{value.name}</option>)
                                }
                            </select>

                            {
                                mapping.selectedFormat?.config?.attributes ? (
                                    <select
                                        className={'border p-2 rounded-md bg-white'}
                                        value={mapping.selectedAttribute}
                                        onChange={e => {
                                            setMapping({...mapping, selectedAttribute: e.target.value})
                                        }}
                                    >
                                        <option>{'Please select a format'}</option>
                                        {
                                            mapping.selectedFormat.config.attributes.map(attr => <option
                                                key={attr.display_name || attr.name}
                                                value={attr.name}>{attr.name}</option>)
                                        }
                                    </select>
                                ) : <div></div>
                            }

                            {
                                targetValues?.length ? (
                                    <MultiSelectComp
                                        className={`border rounded-md bg-white h-full ${mapping.mappedValues?.length ? `p-1` : `p-4`}`}
                                        placeholder={'Please select values...'}
                                        value={mapping.mappedValues}
                                        onChange={e => {
                                            setMapping({...mapping, mappedValues: e})
                                        }}
                                        options={targetValues}
                                    />
                                ) : <div></div>
                            }

                            {
                                targetValues.length && editingIndex !== undefined ?
                                    <div className={'p-1'}>
                                        <button
                                            title={'save'}
                                            className={'bg-blue-300 hover:bg-blue-500 text-white text-sm p-1 rounded-md h-fit self-center'}
                                            onClick={() => {
                                                updateAttribute(col, {[attr]: value.map((v, i) => i === editingIndex ? mapping : v)});
                                                setMapping({});
                                                setEditingIndex(undefined);
                                            }}
                                        > save
                                        </button>
                                        <button
                                            title={'cancel'}
                                            className={'bg-red-300 hover:bg-red-500 text-white text-sm p-1 rounded-md h-fit self-center'}
                                            onClick={() => {
                                                setMapping({});
                                                setEditingIndex(undefined);
                                                setAdding(false);
                                            }}
                                        > cancel
                                        </button>
                                    </div> :
                                    <div>
                                        <button
                                            title={'add mapping'}
                                            className={'bg-blue-300 hover:bg-blue-500 text-white text-sm p-2 rounded-md h-fit self-end'}
                                            onClick={() => {
                                                updateAttribute(col, {[attr]: [...value, mapping]})
                                                setMapping({});
                                            }}
                                        >+
                                        </button>
                                    </div>
                            }
                        </div>
                    </div>
                ) : (
                    <div className={'flex flex-col items-start'}>
                        <button className={'bg-blue-300 hover:bg-blue-500 text-white text-sm p-1 rounded-md'}
                                onClick={() => setAdding(true)}>+ add mappings
                        </button>
                    </div>
                )
            }
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

export const RenderField = ({i, theme, item, attribute, placeholder, className, updateAttribute, removeAttribute, apiLoad, format}) => {
    const [showAdvanced, setShowAdvanced] = useState(false);
    return (
        Array.isArray(item[attribute]) ?
            <div>{
                item[attribute].map((item, i) => <RenderField i={i} item={item} placeholder={placeholder}
                                                              attribute={item?.name}
                                                              theme={theme} updateAttribute={updateAttribute}
                                                              removeAttribute={removeAttribute} apiLoad={apiLoad} format={format}/>)
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
                    <RenderMappings col={item.name} drivingAttribute={item.display} value={item.mappings} attr={'mappings'}
                                    updateAttribute={updateAttribute} apiLoad={apiLoad} format={format}/>
                    <RenderRemoveBtn col={item.name} removeAttribute={removeAttribute}/>

                </div>
            </div>);
}