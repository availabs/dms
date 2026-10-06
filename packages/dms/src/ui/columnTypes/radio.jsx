import React, { useId } from "react"
import { ThemeContext, getComponentTheme } from "../useTheme"
import { radioTheme } from "./radio.theme"

// radio column type. The look comes from theme.radio's named styles, picked by the column's
// `activeStyle` (radio.theme.js lists the keys). The default style is the original plain radio row;
// a style can add per-option markers, a checked look and, with `ordered`, done / upcoming states
// for a stepped list (a page's stage). `checkedTag`: optional text shown after the checked option.

const optionValue = (o) => o.value || o

const RadioList = ({ value, onChange, options, inline, activeStyle, checkedTag, disabled }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...radioTheme.styles[0], ...getComponentTheme(themeFromContext, 'radio', activeStyle) };
    // ids scoped to this list: option values repeat across rows and cards on one page
    const groupId = useId();
    const checkedIndex = options.findIndex(o => optionValue(o) === value);

    return (
        <div className={inline ? t.listRow : t.listCol}>
            {
                options.map((o, i) => {
                    const v = optionValue(o);
                    const checked = i === checkedIndex;
                    const state = checked ? 'Checked'
                        : t.ordered && checkedIndex >= 0 ? (i < checkedIndex ? 'Done' : 'Upcoming')
                        : '';
                    const cls = (key) => [t[key], state && t[`${key}${state}`]].filter(Boolean).join(' ');
                    return (
                        <label key={i} className={cls('wrapper')}>
                            <input id={`${groupId}-${i}`}
                                   name={groupId}
                                   className={t.input}
                                   type="radio" value={v} checked={checked} disabled={disabled}
                                   onChange={e => onChange?.(e.target.value)} />
                            {t.marker ? (
                                <span aria-hidden="true"
                                      className={[cls('marker'), state !== 'Upcoming' && t.markers?.[v]].filter(Boolean).join(' ')}>
                                    {state === 'Done' && t.doneTick ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={t.doneTick}>
                                            <path d="M4.5 12.5l5 5L19.5 7" />
                                        </svg>
                                    ) : null}
                                </span>
                            ) : null}
                            <span className={cls('label')}> {o.label || o} </span>
                            {checked && checkedTag ? <span className={t.tag}>{checkedTag}</span> : null}
                        </label>
                    )
                })
            }
        </div>
    )
}

export const RadioEdit = ({value = '', onChange, options = [], inline=true, activeStyle, checkedTag}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...radioTheme.styles[0], ...getComponentTheme(themeFromContext, 'radio', activeStyle) };
    const isInvalidValue = value && !options.find(o => optionValue(o) === value);
    return (
        <>
            {
                isInvalidValue ? <div className={t.error}>Invalid Value: {JSON.stringify(value)}</div> : null
            }
            <RadioList value={value} onChange={onChange} options={options} inline={inline}
                       activeStyle={activeStyle} checkedTag={checkedTag} />
        </>
    )
}

export const RadioView = ({value = '', options = [], inline=true, className, activeStyle, checkedTag}) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...radioTheme.styles[0], ...getComponentTheme(themeFromContext, 'radio', activeStyle) };
    // A stepped style reads better as its list than as a bare value, so it can opt in.
    if (t.viewAsList && options.length) {
        return <RadioList value={value} options={options} inline={inline}
                          activeStyle={activeStyle} checkedTag={checkedTag} disabled />
    }
    return (
        <div className={className}>
            {value}
        </div>
    )
}
