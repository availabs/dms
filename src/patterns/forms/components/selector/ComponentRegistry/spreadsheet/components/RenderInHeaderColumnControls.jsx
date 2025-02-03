import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {ArrowDown, SortAsc, SortDesc} from "../../../../../../admin/ui/icons";
import {RenderToggleControls} from "../../shared/RenderToggleControls";
import {RenderInputControls} from "../../shared/RenderInputControls";
import {getControlConfig, useHandleClickOutside} from "../../shared/utils";
import {SpreadSheetContext} from "../index";

const RenderLinkControls = ({attribute, updateColumns}) => {
    const [tmpValue, setTmpValue] = useState(attribute || {});

    useEffect(() => {
        let isCanceled = false;
        setTimeout(() => !isCanceled && updateColumns('link', tmpValue), 500)

        return () => {
            isCanceled = true;
        }
    }, [tmpValue]);

    const inputWrapperClassName = `w-full rounded-sm cursor-pointer`
    const inputClassName = `p-0.5 rounded-sm`
    return (
        <div className={'p-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
            <RenderToggleControls className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer`}
                                  title={'Is Link'}
                                  value={tmpValue?.isLink}
                                  setValue={e => setTmpValue({...tmpValue, isLink: e})}
            />
            <div className={tmpValue.isLink ? `mt-0.5 flex flex-col gap-0.5 border rounded-md divide-y` : `hidden`}>
                <RenderInputControls className={inputWrapperClassName}
                                     inputClassName={inputClassName}
                                     type={'text'}
                                     value={tmpValue.linkText}
                                     placeHolder={'Link Text'}
                                     setValue={e => setTmpValue({...tmpValue, linkText: e})}
                />
                <RenderInputControls className={inputWrapperClassName}
                                     inputClassName={inputClassName}
                                     type={'text'}
                                     value={tmpValue.location}
                                     placeHolder={'Location'}
                                     setValue={e => setTmpValue({...tmpValue, location: e})}
                />
            </div>
        </div>
    )
}

const formatOptions = [
    {label: 'No Format Applied', value: ' '},
    {label: 'Comma Seperated', value: 'comma'},
    {label: 'Abbreviated', value: 'abbreviate'},
]

const fontSizeOptions = [
    {label: 'Small Fonts', value: 'small'},
    {label: 'Medium Fonts', value: 'medium'},
    {label: 'Large Fonts', value: 'large'},
    {label: 'XL Fonts', value: 'xl'},
    {label: '2XL Fonts', value: '2xl'},
]

const selectClasses = 'p-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'

// in header menu for each column
export default function RenderInHeaderColumnControls({attribute}) {
    const {state: {columns = []}, setState, compType} = useContext(SpreadSheetContext);
    const {
        allowSortBy,
        allowJustify,
        allowFormat,
        allowFontSize,
        allowHideHeader,
        allowCardSpan,
    } = getControlConfig(compType);
    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = `menu-btn-${attribute.name}-in-header-column-controls`; // used to control isOpen on menu-btm click;
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const maxCardSpan = columns.filter(({show, cardSpan}) => show && !cardSpan).length;

    // updates column if present, else adds it with the change the user made.
    const updateColumns = useCallback((key, value) => setState(draft => {
        // update requested key
        const idx = columns.findIndex(column => column.name === attribute.name);
        if (idx !== -1 && key !== 'link') {
            draft.columns[idx][key] = value;
        }

        if (idx !== -1 && key === 'link') {
            draft.columns[idx] = {...draft.columns[idx], ...value};
        }
    }), [columns, attribute]);

    const sortOptions = [
        {
            label: 'Sorted A->Z',
            value: 'asc nulls last',
            action: () => updateColumns('sort', 'asc nulls last'),
        },
        {
            label: 'Sorted Z->A',
            value: 'desc nulls last',
            action: () => updateColumns('sort', 'desc nulls last'),
        },
        {
            label: attribute.sort ? 'Clear Sort' : 'Not Sorted By',
            value: 'default',
            action: () => updateColumns('sort', ''),
        },
    ];

    const justifyOptions = [
        {label: 'Not Justified', value: ''},
        {label: 'Left Justified', value: 'left'},
        {label: 'Centered', value: 'center'},
        {label: 'Right Justified', value: 'right'},
    ]
    if(compType === 'card') justifyOptions.push({label: 'Full Justified', value: 'full'})
    return (
        <div className="relative w-full">
            <div id={menuBtnId}
                 className={`group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md px-3 py-1 text-sm font-semibold text-gray-600 cursor-pointer`}
                 onClick={e => setIsOpen(!isOpen)}>
                <span className={'truncate select-none'}
                      title={attribute.customName || attribute.display_name || attribute.name}>
                    {attribute.customName || attribute.display_name || attribute.name}</span>
                <div id={menuBtnId} className={'flex items-center'}>
                    {attribute.sort === 'asc nulls last' ? <SortAsc className={'text-gray-500'}/> :
                        attribute.sort === 'desc nulls last' ? <SortDesc className={'text-gray-500'}/> : null}
                    <ArrowDown id={menuBtnId} className={'text-gray-500 group-hover:text-gray-600'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`
                 ${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 absolute right-0 z-[10] divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
            >
                <div className="py-0.5 w-1/2 min-w-fit max-h-[500px] overflow-auto scrollbar-sm">
                    <div className="flex flex-col gap-0.5 items-center px-1 py-1 text-xs text-gray-700">
                        {
                            allowSortBy ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.sort || 'default'}
                                        onChange={e => {
                                            const action = sortOptions.find(o => o.value === e.target.value || o.value === 'default')?.action;
                                            action();
                                        }}
                                    >
                                        {
                                            sortOptions.map(sortOption => <option key={sortOption.value} value={sortOption.value}>{sortOption.label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        {
                            allowJustify ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.justify}
                                        onChange={e => updateColumns('justify', e.target.value)}
                                    >
                                        {
                                            justifyOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        {
                            allowFormat ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.formatFn}
                                        onChange={e => updateColumns('formatFn', e.target.value)}
                                    >
                                        {
                                            formatOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        {
                            allowFontSize ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.fontSize}
                                        onChange={e => updateColumns('fontSize', e.target.value)}
                                    >
                                        {
                                            fontSizeOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        <RenderLinkControls attribute={attribute} updateColumns={updateColumns}/>

                        {
                            allowHideHeader ? (
                                <div className={'p-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
                                    <RenderToggleControls
                                        className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer`}
                                        title={'Hide Header'}
                                        value={attribute.hideHeader}
                                        setValue={e => updateColumns('hideHeader', e)}
                                    />
                                </div>
                            ) : null
                        }

                        {
                            allowCardSpan ? (
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.cardSpan}
                                        onChange={e => updateColumns('cardSpan', e.target.value)}
                                    >
                                        {
                                            Array.from({length: maxCardSpan}, (v, k) => ({label: `Card Span: ${k+1}`, value: k+1}))
                                                .map(({label, value}) => <option key={value} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div>
                            ) : null
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}
