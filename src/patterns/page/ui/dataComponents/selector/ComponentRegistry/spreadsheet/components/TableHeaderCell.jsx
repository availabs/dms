import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {RenderToggleControls} from "../../shared/RenderToggleControls";
import {RenderInputControls} from "../../shared/RenderInputControls";
import {getControlConfig, useHandleClickOutside} from "../../shared/utils";
import {ComponentContext} from "../../shared/dataWrapper";
import {Group, InfoCircle, LeftToRightListBullet, TallyMark, Sum, ArrowDown, SortAsc, SortDesc} from "../../../../../icons";
import {ColorControls} from "../../shared/ColorControls";


const selectClasses = 'w-full rounded-md bg-white group-hover:bg-gray-100 cursor-pointer'
const selectWrapperClass = 'group px-2 py-1 w-full flex items-center cursor-pointer hover:bg-gray-100'
const selectLabelClass = 'font-regular text-gray-500 cursor-default'

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
        <div className={'px-2 py-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
            <RenderToggleControls className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer ${selectLabelClass}`}
                                  title={'Is Link'}
                                  value={tmpValue?.isLink}
                                  setValue={e => setTmpValue({...tmpValue, isLink: e})}
            />
            <div className={tmpValue.isLink ? `mt-0.5 flex flex-col gap-0.5 border rounded-md divide-y` : `hidden`}>
                <RenderToggleControls className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer ${selectLabelClass}`}
                                      title={'Use ID'}
                                      value={tmpValue?.useId}
                                      setValue={e => setTmpValue({...tmpValue, useId: e})}
                />
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

const fontStyleOptions = [
    { label: 'X-Small', value: 'textXS' },
    { label: 'X-Small Regular', value: 'textXSReg' },
    { label: 'Small', value: 'textSM' },
    { label: 'Small Regular', value: 'textSMReg' },
    { label: 'Small Bold', value: 'textSMBold' },
    { label: 'Small SemiBold', value: 'textSMSemiBold' },
    { label: 'Base', value: 'textMD' },
    { label: 'Base Regular', value: 'textMDReg' },
    { label: 'Base Bold', value: 'textMDBold' },
    { label: 'Base SemiBold', value: 'textMDSemiBold' },
    { label: 'XL', value: 'textXL' },
    { label: 'XL SemiBold', value: 'textXLSemiBold' },
    { label: '2XL', value: 'text2XL' },
    { label: '2XL Regular', value: 'text2XLReg' },
    { label: '3XL', value: 'text3XL' },
    { label: '3XL Regular', value: 'text3XLReg' },
    { label: '4XL', value: 'text4XL' },
    { label: '5XL', value: 'text5XL' },
    { label: '6XL', value: 'text6XL' },
    { label: '7XL', value: 'text7XL' },
    { label: '8XL', value: 'text8XL' },
];

// in header menu for each column
export default function TableHeaderCell({attribute}) {
    const {state: {columns = [], display}, setState, compType} = useContext(ComponentContext);
    const {
        allowSortBy,
        allowJustify,
        allowFormat,
        allowFontStyleSelect,
        allowHideHeader,
        allowCardSpan,
        allowLinkControl,
        allowBGColorSelector
    } = getControlConfig(compType);
    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = `menu-btn-${attribute.name}-in-header-column-controls`; // used to control isOpen on menu-btm click;
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const maxCardSpan = display.gridSize || columns.filter(({show, cardSpan}) => show).length;

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
    const iconClass = 'text-gray-400';
    const iconSizes = {width: 14 , height: 14}
    const fnIcons = {
        count: <TallyMark key={'count-icon'} className={iconClass} {...iconSizes} />,
        list: <LeftToRightListBullet key={'list-icon'} className={iconClass} {...iconSizes} />,
        sum: <Sum key={'sum-icon'} className={iconClass} {...iconSizes} />,
    }

    return (
        <div className="relative w-full">
            <div id={menuBtnId}
                 className={`group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md cursor-pointer`}
                 onClick={e => setIsOpen(!isOpen)}>
                <span className={'truncate select-none'}
                      title={attribute.customName || attribute.display_name || attribute.name}>
                    {attribute.customName || attribute.display_name || attribute.name}
                </span>
                <div id={menuBtnId} className={'flex items-center'}>
                    {/*/!*<InfoCircle width={16} height={16} className={'text-gray-500'} />*!/ needs a lexical modal*/}
                    {
                        attribute.group ? <Group key={'group-icon'} className={iconClass} {...iconSizes} /> :
                            attribute.fn ? fnIcons[attribute.fn] || attribute.fn : null
                    }
                    {
                        attribute.sort === 'asc nulls last' ? <SortAsc key={'sort-icon'} className={iconClass} {...iconSizes} /> :
                            attribute.sort === 'desc nulls last' ? <SortDesc key={'sort-icon'} className={iconClass} {...iconSizes} /> : null
                    }

                    <ArrowDown id={menuBtnId} className={'text-gray-400 group-hover:text-gray-600 transition ease-in-out duration-200'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`min-w-[180px]
                 ${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 absolute right-0 z-[10] divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
            >
                <div className="py-0.5 min-w-fit max-h-[500px] overflow-auto scrollbar-sm">
                    <div className="flex flex-col gap-0.5 items-center px-1 py-1 text-xs text-gray-600 font-regular">
                        {
                            allowSortBy ?
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Sort</label>
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
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Justify</label>
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
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Format</label>
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
                            allowFontStyleSelect ?
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Header</label>
                                    <select
                                        className={selectClasses}
                                        value={attribute.headerFontStyle}
                                        onChange={e => updateColumns('headerFontStyle', e.target.value)}
                                    >
                                        {
                                            fontStyleOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        {
                            allowFontStyleSelect ?
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Value</label>
                                    <select
                                        className={selectClasses}
                                        value={attribute.valueFontStyle}
                                        onChange={e => updateColumns('valueFontStyle', e.target.value)}
                                    >
                                        {
                                            fontStyleOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        
                        }

                        {
                            allowLinkControl ? <RenderLinkControls attribute={attribute} updateColumns={updateColumns}/> : null
                        }

                        {
                            allowHideHeader ? (
                                <div className={'px-2 py-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'}>
                                    <RenderToggleControls
                                        className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer ${selectLabelClass}`}
                                        title={'Hide Header'}
                                        value={attribute.hideHeader}
                                        setValue={e => updateColumns('hideHeader', e)}
                                    />
                                </div>
                            ) : null
                        }

                        {
                            allowCardSpan && !display.compactView ? (
                                <div className={selectWrapperClass}>
                                    <label className={selectLabelClass}>Span</label>
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

                        {
                            allowBGColorSelector && !display.compactView ?
                                <div className={`w-full px-0.5 ${selectLabelClass}`}>
                                    <ColorControls value={attribute.bgColor}
                                                   setValue={e => updateColumns('bgColor', e)}
                                                   title={'Background Color'}
                                    />
                                </div>
                                : null
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}
