import React, {useContext, useRef, useState} from "react"
import {Combobox} from '@headlessui/react'
import {CMSContext} from '../../context'
import {ThemeContext} from "../../../../ui/useTheme";
import {convert} from './convertToSpreadSheet'
import { v4 as uuidv4 } from 'uuid';

export function ViewSectionHeader({
    value,
    TitleComp,
    updateAttribute,
    helpTextArray,
    HelpComp
}) {
    const { UI, theme } = React.useContext(ThemeContext)
    const { Popup, Icon } = UI

    let helpTextCondition = helpTextArray.some(({text, icon}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) || // empty child
        (text?.root?.children?.length === 0) // no children
    ))
    return (
        <div className={`flex w-full min-h-[50px] items-center pb-2`}>
            <div id={`#${value?.title?.replace(/ /g, '_')}`}
                 className={`flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center`}>
                <div className='flex-1'>
                    <TitleComp
                        className={`w-full ${theme.heading?.[value?.['level']] || theme.heading?.['default']}`}
                        value={value?.['title']}
                    />
                </div>
                <div className='flex item-center h-full pointer-events-auto'>
                    {value?.['tags']?.length ?
                        (<Popup button={
                            <div className='p-2 border border-[#E0EBF0] rounded-full print:hidden'>
                                <Icon icon={'Tags'} className='text-slate-400 hover:text-blue-500 size-4'
                                      title="Tags"/>
                            </div>
                        }>
                            <TagComponent
                                className='p-2 flex-0'
                                value={value?.['tags']}
                                placeholder={'Add Tag...'}
                                onChange={(v) => updateAttribute('tags', v)}
                            />
                        </Popup>) : null}

                    {
                        helpTextCondition && (
                            helpTextArray.map(({text, icon = 'InfoSquare'}, i) => (
                                <Popup
                                    key={i}
                                    button={
                                        <div className='p-2 border border-[#E0EBF0] rounded-full print:hidden'>
                                            <Icon icon={icon}
                                                  className='text-slate-400 hover:text-blue-500 size-4 print:hidden flex justify-center items-center'
                                                  title="Info"/>
                                        </div>
                                    }>
                                    <div className={'max-w-[500px] flex flex-col px-4 py-2 bg-white shadow-md'}>
                                        <HelpComp value={text}/>
                                    </div>
                                </Popup>
                            ))
                        )
                    }
                </div>
            </div>
        </div>
    )
}

export function HelpTextEditPopups({
    helpTextArray,
    updateAttribute,
    HelpComp
}) {
    const { UI, theme } = React.useContext(ThemeContext)
    const { Popup, Icon, Listbox } = UI
    return (
        <>
            {helpTextArray.map(({text, icon = 'InfoSquare', visibility = ''}, i) => (
                <Popup
                    key={i}
                    button={
                        <div className={'relative'}>
                            <div className='p-2 border border-[#E0EBF0] rounded-full print:hidden'>
                                <Icon icon={icon}
                                      className='text-slate-400 hover:text-blue-500 size-4 print:hidden flex justify-center items-center'
                                      title="Info"/>
                            </div>
                        </div>
                    }>
                    {({setOpen}) => (
                        <div className={'max-w-[500px] flex flex-col bg-white shadow-md'}>
                            <Icon icon={'TrashCan'}
                                  className={'text-red-400 hover:text-red-600 self-end size-4 hover:cursor-pointer'}
                                  onClick={() => {
                                      updateAttribute('helpText', helpTextArray.filter((t, ii) => i !== ii))
                                      setOpen(false)
                                  }
                                  }/>
                            <Listbox value={icon}
                                     onChange={(v) => updateAttribute('helpText', helpTextArray.map((t, ii) => i === ii ? {
                                         text,
                                         icon: v,
                                         visibility
                                     } : t))}
                                     options={[
                                         {label: 'Info', value: 'InfoSquare'},
                                         ...Object.keys(theme.Icons)
                                             .map((iconName) => {
                                                 return {
                                                     label: (
                                                         <div className='flex'>
                                                             <div className='px-2'>
                                                                 <Icon icon={iconName}
                                                                       className='size-6'/>
                                                             </div>
                                                             <div>
                                                                 {iconName}
                                                             </div>
                                                         </div>
                                                     ),
                                                     value: iconName
                                                 }
                                             }),
                                         {label: 'No Icon', value: 'none'}
                                     ]}
                            />

                            <Listbox value={visibility}
                                     onChange={(v) => updateAttribute('helpText', helpTextArray.map((t, ii) => i === ii ? {
                                         text,
                                         icon,
                                         visibility: v
                                     } : t))}
                                     options={[
                                         {label: 'Visibility: view, edit', value: ''},
                                         {label: 'Visibility: edit', value: 'edit'},
                                     ]}
                            />

                            <HelpComp value={text}
                                      onChange={(v) => updateAttribute('helpText', helpTextArray.map((t, ii) => i === ii ? {
                                          text: v,
                                          icon,
                                          visibility
                                      } : t))}/>
                        </div>
                    )}
                </Popup>
            ))}
        </>
    )
}

export function TagComponent({value, placeholder, onChange, edit = false}) {
    const {UI} = useContext(ThemeContext);
    const {Icon, Label} = UI;
    const arrayValue = Array.isArray(value) ? value : (value?.split(',')?.filter(v => v?.length) || [])
    const [newTag, setNewTag] = useState('');

    const tags = [
        'Hazard',
        'Hurricane',
        'Avalanche',
        'Earthquake',
        'Rec',
        "S1", "S1-a", "S2", "S2-a", "S2-a1", "S2-a2", "S2-a3", "S2-a4", "S2-a5", "S2-a6", "S2-a7", "S2-a8", "S2-a9", "S3", "S3-a", "S3-a1", "S3-a2", "S3-a3", "S3-b2", "S4", "S4-a", "S4-b", "S5", "S5-a", "S5-b", "S5-1", "S6", "S6-a", "S6-a1", "S6-a2", "S6-a2.i", "S6-a2.ii", "S6-a2.iii", "S6-b", "S7", "S7-a", "S7-a1", "S7-a2", "S7-a3", "S7-a4", "S8", "S8-1", "S8-a", "S8-a1", "S8-a2", "S8-a2.i", "S8-a3", "S8-a3.i", "S8-a3.ii", "S8-a3.iii", "S8-a3.iv", "S8-a3.v", "S8-a4", "S8-b", "S8-b1", "S8-b2", "S8-b3", "S8-c", "S8-c1", "S8-c2", "S9", "S9-a", "S9-b", "S10", "S10-a", "S10-b", "S10-c", "S10-d", "S11", "S11-a", "S11-b", "S12", "S12-a", "S12-b", "S13", "S13-a", "S13-b", "S13-b1", "S13-b2", "S14", "S14-a", "S14-a1", "S14-a2", "S14-a3", "S14-b", "S14-b1", "S14-b2", "S15", "S15-a", "S15-a1", "S15-a2", "S15-a3", "S16", "S16-a", "S16-b", "S17", "S17-1", "S17-1a", "S17-1b", "S18", "S18-a", "S18-b", "S18-b1", "S18-b2", "S18-b3", "S18-c", "S19", "S19-a", "S19-1", "S20", "S20-a", "S20-b", "HHPD1", "HHPD1-1", "HHPD1-a", "HHPD1-b", "HHPD1-b1", "HHPD1-b2", "HHPD1-2", "HHPD2", "HHPD2-1", "HHPD2-a", "HHPD2-b", "HHPD2-b1", "HHPD2-b2", "HHPD2-b3", "HHPD2-b4", "HHPD2-c", "HHPD3", "HHPD3-1", "HHPD3-a", "HHPD3-a1", "HHPD3-a2", "HHPD3-a3", "HHPD3-a4", "HHPD3-b", "HHPD4", "HPPD4-1", "HPPD4-a", "HPPD4-a1", "HPPD4-a2", "HPPD4-a3", "HPPD4-a4", "HPPD4-a5", "HHPD4-b", "HHPD4-c", "HHPD5", "HHPD5-a", "HHPD6", "HHPD6-1", "HHPD6-a", "HHPD6-b", "HHPD6-c", "HHPD7", "HHPD7-1", "HHPD7-a", "HHPD7-b", "FMAG1", "FMAG1-a", "FMAG1-b", "FMAG1-c", "FMAG1-d", "FMAG2", "FMAG2-a"
    ]

    return (
        <div className='w-full bg-white shadow-md'>

            {edit && <Combobox>
                <div className="relative z-20">
                    <Combobox.Input
                        className="h-12 w-[189px] bg-blue-50 m-1 p-2 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                        placeholder={placeholder}
                        value={newTag}
                        onChange={(e) => {
                            setNewTag(e.target.value)
                        }}

                        onKeyUp={(e => {
                            if (e.key === 'Enter' && newTag.length > 0) {
                                onChange([...arrayValue, newTag].join(','))
                                setNewTag('')
                            }
                        })}
                    />
                </div>
                {tags
                    .filter(tag => (!newTag?.length || tag.toLowerCase().includes(newTag.toLowerCase())))
                    .length ? (
                    <Combobox.Options
                        static
                        className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3"
                    >

                        {tags
                            .filter(tag => (newTag.length > 0 && tag.toLowerCase().includes(newTag.toLowerCase())))
                            .filter((tag, i) => i <= 5)
                            .map((tag) => (
                                <Combobox.Option
                                    key={tag}
                                    value={tag}
                                    onClick={() => {
                                        setNewTag(tag)
                                    }}
                                    className={({active}) => `flex cursor-pointer select-none rounded-xl p-1 ${active && 'bg-gray-100'}`}>
                                    <Label text={tag}/>
                                </Combobox.Option>
                            ))}
                    </Combobox.Options>
                ) : null
                }
            </Combobox>}
            <div className='w-full min-h-8 flex flex-col gap-1 px-1 py-2'>
                {
                    arrayValue
                        .sort((a, b) => a.localeCompare(b))
                        .map((d, i) => (
                            <Label key={d} text={
                                <div key={i} className='flex justify-between items-center'>
                                    {d}
                                    {edit ? <div className='cursor-pointer'
                                                 onClick={() => onChange(arrayValue.filter(v => v !== d).join(','))}>
                                        <Icon icon={'RemoveCircle'}
                                              className='text-red-400 hover:text-red-600  w-[16px] h-[16px]'/>
                                    </div> : null}
                                </div>
                            }/>
                        ))
                }
            </div>
        </div>
    )

}

export const handlePaste = async (e, setKey, setState, value, onChange) => {
    e.preventDefault();
    try {
        const text = await navigator.clipboard.readText();
        const copiedValue = isJson(text) && JSON.parse(text || '{}');

        if (!copiedValue || !copiedValue['element']?.['element-type']) return;
        const elementData = copiedValue['element']['element-data'];
        setKey(copiedValue['element']['element-type']) // mainly for lexical so it updates with value
        setState(isJson(elementData) ? JSON.parse(elementData) : elementData) // state inits with element-data from prop. need to update on paste.
        const pastedValue = {}

        Object.keys(copiedValue)
            .filter(key => !['id', 'ref'].includes(key))
            .map(key => {
                pastedValue[key] = copiedValue[key]
            })

        onChange({...value, ...pastedValue});
    } catch (e) {
        console.error('<paste>', e)
    }
}

export function DeleteModal({title, prompt, item = {}, open, setOpen, onDelete}) {
    const cancelButtonRef = useRef(null)
    const {UI} = React.useContext(ThemeContext)
    const {baseUrl} = React.useContext(CMSContext) || {}
    const {Dialog} = UI
    const [loading, setLoading] = useState(false)
    return (
        <Dialog
            open={open}
            setOpen={setOpen}
            initialFocus={cancelButtonRef}
        >
            <div className="sm:flex sm:items-start z-50">
                <div
                    className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <i className="fa fa-danger h-6 w-6 text-red-600" aria-hidden="true"/>
                </div>
                <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <h3 className="text-base font-semibold leading-6 text-gray-900">
                        {title || `Delete ${item.title || ''} ${item.id}`}
                    </h3>
                    <div className="mt-2">
                        <p className="text-sm text-gray-500">
                            {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                    type="button"
                    disabled={loading}
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                    onClick={onDelete}
                >
                    Delet{loading ? 'ing...' : 'e'}
                </button>
                <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={() => setOpen(false)}
                    ref={cancelButtonRef}
                >
                    Cancel
                </button>
            </div>
        </Dialog>
    )
}

export const getHelpTextArray = (value) => {
  return Array.isArray(value?.['helpText']) ?
      value?.['helpText'] :
      value?.['helpText']?.text ?
          [value?.['helpText']] :
          value?.helpText ?
              [{text: value?.['helpText']}] :
              [];
}

export const isJson = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const handleCopy = (value) => {
    const elementType = value?.element?.['element-type'];
    //--------------------------------------
    // Temp Code to migrate off cenrep II
    //--------------------------------------
    if (elementType === 'Table: Cenrep II') {
        const spreadsheetData = convert(JSON.parse(value.element['element-data']));
        const ssElement = {
            ...value,
            element: {'element-type': 'Spreadsheet', 'element-data': JSON.stringify(spreadsheetData)}
        };
        console.log(ssElement);
        navigator.clipboard.writeText(JSON.stringify(ssElement))
        return;
    }

    navigator.clipboard.writeText(JSON.stringify(value))
}
