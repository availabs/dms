import React, {useContext, useRef, useState} from "react"
import {CMSContext} from '../../context'
import {ThemeContext} from "../../../../ui/useTheme";

// ── Section header band tokens ───────────────────────────────────────────────
// Every class in this band used to be hardcoded, so no theme could reach it: a fixed 50px row,
// `font-display font-medium uppercase`, and a title class of `w-full ${theme.heading[level]}`.
// These tokens (theme `pages.section`) open it up WITHOUT changing anything for a theme that
// sets none of them — each default below is the literal string this component emitted before
// the tokens existed, down to the trailing space in the title class and the `undefined` a
// missing `theme.heading` produces. That is not pedantry: 154,632 MitigateNY component rows
// render a title through here and none of them will ever set one of these. The exact markup is
// locked in tests/viewSectionHeaderLegacy.test.js against goldens captured from the pre-token
// code — a diff there means an existing site's pages changed.
//
// `??` rather than `||` throughout, so a theme can deliberately set a token to "" (e.g. to
// remove the band's padding) instead of silently getting the default back.
const HEADER_DEFAULTS = {
    headerRow:      'flex w-full min-h-[50px] items-center pb-2',
    headerInner:    'flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center',
    headerTitleWrap:'flex-1',
    headerActions:  'flex item-center h-full pointer-events-auto',
    // Unset by default, and BOTH are opt-in by the theme rather than by the data:
    //  • headerTitle  — appended AFTER the historical `w-full ${heading}` string, never replacing it.
    //  • headerKicker — the right-hand meta line, rendered from the section's own `description`
    //    attribute. That attribute has been registered in page.format.js for years with no render
    //    path at all (measured 2026-09-11: zero sections carry a value, site-wide), so giving it
    //    one cannot surface text an author never expected to see. Gated on the TOKEN, not on the
    //    value, so a site that later fills a description still shows nothing until it opts in.
    headerTitle:  '',
    headerKicker: '',
    // When a theme registers sectionHeaderExtensions (see sectionHeaderExtensions.js), they
    // render on their own row BELOW this band by default. `headerExtensionsInline` moves them
    // into the band itself, sharing the row with the title — the graph-card header shape, where
    // the title, the measure pills and the settings kebab are one 40px line.
    //
    // The kicker and the extensions SHARE that right-hand slot rather than one suppressing the
    // other. An earlier version hid the kicker whenever `headerExtensions` was non-empty, which
    // looked right and was wrong: an extension builder returns a React node whose component may
    // then render `null` (npmrds' Quick Controls do exactly that outside page-edit mode), so
    // array length says nothing about whether anything is actually drawn — the kicker vanished
    // on every report card in view mode, which is the one mode it exists for. A theme that wants
    // the kicker to yield on a narrow card does it in the token, with a breakpoint.
    headerExtensionsInline: false,
    headerExtensionsInlineRow: 'shrink-0 flex items-center gap-1.5',
};

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
    const t = key => sectionTheme?.[key] ?? HEADER_DEFAULTS[key];

    let helpTextCondition = helpTextArray.some(({text, icon}) => text && !(
        (text?.root?.children?.length === 1 && text?.root?.children?.[0]?.children?.length === 0) || // empty child
        (text?.root?.children?.length === 0) // no children
    ))
    // Kept as one template literal so the unset case is byte-identical to the historical string,
    // including `w-full undefined` when the theme has no `heading` map at all.
    const headingClassName = `w-full ${theme.heading?.[value?.['level']] || theme.heading?.['default']}`;
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
    HelpComp
}) {
    const { UI, theme } = React.useContext(ThemeContext)
    const { Popup, Icon, ColumnTypes } = UI
    const Select = ColumnTypes?.select?.EditComp || (() => {});
    return (
        <>
            {helpTextArray.map(({text, icon = 'InfoSquare', visibility = ' '}, i) => (
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

            {edit && <div>
                <div className="relative z-20">
                    <input
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
