import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {RenderToggleControls} from "../../shared/RenderToggleControls";
import {RenderInputControls} from "../../shared/RenderInputControls";
import {getControlConfig, useHandleClickOutside} from "../../shared/utils";
import {SpreadSheetContext} from "../index";
import {Group, InfoCircle, LeftToRightListBullet, TallyMark, Sum, ArrowDown, SortAsc, SortDesc} from "../../../../../icons";
import {ColorControls} from "../../shared/ColorControls";

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
            <RenderToggleControls className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer`}
                                  title={'Is Link'}
                                  value={tmpValue?.isLink}
                                  setValue={e => setTmpValue({...tmpValue, isLink: e})}
            />
            <div className={tmpValue.isLink ? `mt-0.5 flex flex-col gap-0.5 border rounded-md divide-y` : `hidden`}>
                <RenderToggleControls className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer`}
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

const headerFontSizeOptions = [
    {label: 'X-Small Header Fonts', value: 'textXS'},
    {label: 'Small Header Fonts', value: 'textSM'},
    {label: 'Medium Header Fonts', value: 'textMD'},
    {label: 'Large Header Fonts', value: 'textLG'},
    {label: 'XL Header Fonts', value: 'textXL'},
    {label: '2XL Header Fonts', value: 'text2XL'},
    {label: '3XL Header Fonts', value: 'text3XL'},
    {label: '4XL Header Fonts', value: 'text4XL'},
    {label: '5XL Header Fonts', value: 'text5XL'},
    {label: '6XL Header Fonts', value: 'text6XL'},
    {label: '7XL Header Fonts', value: 'text7XL'},
    {label: '8XL Header Fonts', value: 'text8XL'},
    {label: '9XL Header Fonts', value: 'text9XL'},
];

const valueFontSizeOptions = [
    {label: 'X-Small Value Fonts', value: 'textXS'},
    {label: 'Small Value Fonts', value: 'textSM'},
    {label: 'Medium Value Fonts', value: 'textMD'},
    {label: 'Large Value Fonts', value: 'textLG'},
    {label: 'XL Value Fonts', value: 'textXL'},
    {label: '2XL Value Fonts', value: 'text2XL'},
    {label: '3XL Value Fonts', value: 'text3XL'},
    {label: '4XL Value Fonts', value: 'text4XL'},
    {label: '5XL Value Fonts', value: 'text5XL'},
    {label: '6XL Value Fonts', value: 'text6XL'},
    {label: '7XL Value Fonts', value: 'text7XL'},
    {label: '8XL Value Fonts', value: 'text8XL'},
    {label: '9XL Value Fonts', value: 'text9XL'},
];

const headerFontWeightOptions = [
    { label: 'Light Header Fonts', value: 'fontLight' },
    { label: 'Normal Header Fonts', value: 'fontNormal' },
    { label: 'Medium Header Fonts', value: 'fontMedium' },
    { label: 'Semi Bold Header Fonts', value: 'fontSemiBold' },
    { label: 'Bold Header Fonts', value: 'fontBold' },
    { label: 'Extra Bold Header Fonts', value: 'fontExtraBold' }
];

const valueFontWeightOptions = [
    { label: 'Light Value Fonts', value: 'fontLight' },
    { label: 'Normal Value Fonts', value: 'fontNormal' },
    { label: 'Medium Value Fonts', value: 'fontMedium' },
    { label: 'Semi Bold Value Fonts', value: 'fontSemiBold' },
    { label: 'Bold Value Fonts', value: 'fontBold' },
    { label: 'Extra Bold Value Fonts', value: 'fontExtraBold' }
];

const selectClasses = 'p-1 w-full rounded-md bg-white hover:bg-gray-100 cursor-pointer'

// in header menu for each column
export default function TableHeaderCell({attribute}) {
    const {state: {columns = [], display}, setState, compType} = useContext(SpreadSheetContext);
    const {
        allowSortBy,
        allowJustify,
        allowFormat,
        allowFontSize,
        allowFontWeight,
        allowHideHeader,
        allowCardSpan,
        allowLinkControl,
        allowBGColorSelector
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
                 className={` min-w-[150px]
                 ${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} 
                 absolute right-0 z-[10] divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition`}
            >
                <div className="py-0.5 w-1/2 min-w-fit max-h-[500px] overflow-auto scrollbar-sm">
                    <div className="flex flex-col gap-0.5 items-center px-1 py-1 text-xs text-gray-600 font-regular">
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
                                        value={attribute.headerFontSize}
                                        onChange={e => updateColumns('headerFontSize', e.target.value)}
                                    >
                                        {
                                            headerFontSizeOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        }

                        {
                            allowFontSize ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.valueFontSize}
                                        onChange={e => updateColumns('valueFontSize', e.target.value)}
                                    >
                                        {
                                            valueFontSizeOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null
                        
                        }

                        {
                            allowFontWeight ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.headerFontWeight}
                                        onChange={e => updateColumns('headerFontWeight', e.target.value)}
                                    >
                                        {
                                            headerFontWeightOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
                                        }
                                    </select>
                                </div> : null

                        }

                        {
                            allowFontWeight ?
                                <div className={'w-full cursor-pointer'}>
                                    <select
                                        className={selectClasses}
                                        value={attribute.valueFontWeight}
                                        onChange={e => updateColumns('valueFontWeight', e.target.value)}
                                    >
                                        {
                                            valueFontWeightOptions.map(({label, value}) => <option key={label} value={value}>{label}</option>)
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
                                        className={`inline-flex w-full justify-center items-center rounded-md cursor-pointer`}
                                        title={'Hide Header'}
                                        value={attribute.hideHeader}
                                        setValue={e => updateColumns('hideHeader', e)}
                                    />
                                </div>
                            ) : null
                        }

                        {
                            allowCardSpan && !display.compactView ? (
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

                        {
                            allowBGColorSelector && !display.compactView ?
                                <ColorControls value={attribute.bgColor}
                                               setValue={e => updateColumns('bgColor', e)}
                                               title={'Background Color'}
                                />
                                : null
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}
