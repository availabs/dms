import React, {useContext, useRef, useState} from "react"
import {CMSContext} from '../../context'
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {sectionToken, sectionTitleClass} from "./section_utils";


export function ViewSectionHeader({
    value,
    TitleComp,
    updateAttribute,
    helpTextArray,
    HelpComp,
    // The already-resolved `pages.section` style. Passed in rather than read from context here,
    // because which style is live is decided per-section by `value.activeStyle` and only
    // section.jsx knows it (same reason GraphComponent.jsx injects the legend's class tokens).
    // Undefined ⇒ every default above applies ⇒ historical markup.
    sectionTheme,
    // Theme-supplied header extensions, already built by section.jsx. Only passed when the
    // theme asked for them inline; otherwise section.jsx still renders its own row below.
    headerExtensions,
}) {
    const { UI, theme } = React.useContext(ThemeContext)
    const { Popup, Icon } = UI
    const t = key => sectionToken(sectionTheme, key);

    let helpTextCondition = helpTextArray.some(({text, icon}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) || // empty child
        (text?.root?.children?.length === 0) // no children
    ))
    // Kept as one template literal so the unset case is byte-identical to the historical string,
    // including `w-full undefined` when the theme has no `heading` map at all.
    // `headerTitleLevels` (a pages.section token) replaces that lookup when a theme sets it.
    const headingClassName = sectionTitleClass(sectionTheme, theme, value?.['level']);
    const inlineExtensions = t('headerExtensionsInline') ? (headerExtensions || []) : [];
    const kicker = t('headerKicker') && value?.['description'] ? value['description'] : null;
    return (
        <div className={t('headerRow')}>
            <div id={`#${value?.title?.replace(/ /g, '_')}`}
                 className={t('headerInner')}>
                <div className={t('headerTitleWrap')}>
                    <TitleComp
                        className={t('headerTitle') ? `${headingClassName} ${t('headerTitle')}` : headingClassName}
                        value={value?.['title']}
                    />
                </div>
                {kicker ? <div className={t('headerKicker')}>{kicker}</div> : null}
                <div className={t('headerActions')}>
                    {value?.['tags']?.length ?
                        (<Popup button={
                            <div className={t('tagButton')}>
                                <Icon icon={'Tags'} className={t('tagIcon')}
                                      title="Tags"/>
                            </div>
                        }>
                            <TagComponent
                                className='p-2 flex-0'
                                wrapperClassName={t('tagPopup')}
                                listClassName={t('tagList')}
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
                                        <div className={t('helpButton')}>
                                            <Icon icon={icon}
                                                  className={t('helpIcon')}
                                                  title="Info"/>
                                        </div>
                                    }>
                                    <div className={t('helpPopup')}>
                                        <HelpComp value={text}/>
                                    </div>
                                </Popup>
                            ))
                        )
                    }
                </div>
            </div>
            {inlineExtensions.length > 0 ? (
                <div className={t('headerExtensionsInlineRow')}>
                    {inlineExtensions.map((node, idx) => <React.Fragment key={idx}>{node}</React.Fragment>)}
                </div>
            ) : null}
        </div>
    )
}

export function HelpTextEditPopups({
    helpTextArray,
    updateAttribute,
    HelpComp,
    sectionTheme,
}) {
    const { UI, theme } = React.useContext(ThemeContext)
    const t = key => sectionToken(sectionTheme, key);
    const { Popup, Icon, ColumnTypes } = UI
    const Select = ColumnTypes?.select?.EditComp || (() => {});
    return (
        <>
            {helpTextArray.map(({text, icon = 'InfoSquare', visibility = ' '}, i) => (
                <Popup
                    key={i}
                    button={
                        <div className={'relative'}>
                            <div className={t('helpButton')}>
                                <Icon icon={icon}
                                      className={t('helpIcon')}
                                      title="Info"/>
                            </div>
                        </div>
                    }>
                    {({setOpen}) => (
                        <div className={t('helpEditPopup')}>
                            <Icon icon={'TrashCan'}
                                  className={t('helpDeleteIcon')}
                                  onClick={() => {
                                      updateAttribute('helpText', helpTextArray.filter((t, ii) => i !== ii))
                                      setOpen(false)
                                  }
                                  }/>
                            <Select value={icon}
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
                                                     label: iconName,
                                                     value: iconName
                                                 }
                                             }),
                                         {label: 'No Icon', value: 'none'}
                                     ]}
                            />

                            <Select value={visibility}
                                     onChange={(v) => updateAttribute('helpText', helpTextArray.map((t, ii) => i === ii ? {
                                         text,
                                         icon,
                                         visibility: v
                                     } : t))}
                                     options={[
                                         {label: 'Visibility: view, edit', value: ' '},
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

// wrapperClassName / listClassName: the popup card + tag list (pages.section tagPopup / tagList
// in view mode); unset keeps the historical classes.
export function TagComponent({value, placeholder, onChange, edit = false, wrapperClassName, listClassName}) {
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
        <div className={wrapperClassName ?? 'w-full bg-white shadow-md'}>

            {edit && <div>
                <div className="relative z-20">
                    <span className="block w-[189px] m-1">
                    <UI.Input
                        aria-label={placeholder || 'Add a tag'}
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
                    </span>
                </div>
                {tags
                    .filter(tag => (!newTag?.length || tag.toLowerCase().includes(newTag.toLowerCase())))
                    .length ? (
                    <div
                        role="listbox"
                        className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3"
                    >

                        {tags
                            .filter(tag => (newTag.length > 0 && tag.toLowerCase().includes(newTag.toLowerCase())))
                            .filter((tag, i) => i <= 5)
                            .map((tag) => (
                                <div
                                    key={tag}
                                    role="option"
                                    onClick={() => {
                                        setNewTag(tag)
                                    }}
                                    className="flex cursor-pointer select-none rounded-xl p-1 hover:bg-gray-100">
                                    <Label text={tag}/>
                                </div>
                            ))}
                    </div>
                ) : null
                }
            </div>}
            <div className={listClassName ?? 'w-full min-h-8 flex flex-col gap-1 px-1 py-2'}>
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

// The delete-section confirmation (section.jsx): the shared UI.DeleteModal (2026-10-16, raw-HTML pass — was a
// hand-built Dialog with raw red / white buttons and an unthemed body).
export function DeleteModal(props) {
    const {UI} = React.useContext(ThemeContext)
    const {DeleteModal: SharedDeleteModal} = UI
    // opened from the section menu (a Popup at z-index 9999): the modal must layer above it
    return <SharedDeleteModal modalStyle="aboveMenu" {...props} />
}


// The section menu's action row (copy link / copy / paste / move / refresh, back / home, save /
// cancel / edit). v6 (pages.section menuActionStyle set): 28px row-icon UI.Buttons, "copied" = go; spec
// design_system_v6/pages/ui-controls.html (Menus). '' (legacy freeze) → the original blue / orange / green Pill
// chips, unchanged. Same props as Pill.
export function ActionBtn({ color, text, title, onClick }) {
    const { theme, UI } = React.useContext(ThemeContext) || {};
    const sec = getComponentTheme(theme, 'pages.section') || {};
    if (!sec.menuActionStyle) {
        const { Pill } = UI;
        return <Pill activeStyle={color} text={text} title={title} onClick={onClick} />;
    }
    // UI.Button named styles (2026-10-16): the row icon, 'iconRowGo' for the copied state. Save looks like the rest
    // (it read a `menuActionSave` key no theme defined, so it rendered unstyled).
    return <UI.Button activeStyle={color === 'green' ? 'iconRowGo' : sec.menuActionStyle} title={title} aria-label={title} onClick={onClick}>{text}</UI.Button>;
}
