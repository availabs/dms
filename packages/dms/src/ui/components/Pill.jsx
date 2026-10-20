import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme'
import { warnLockedClassName } from '../warnLockedClassName'
import { pillTheme } from './Pill.theme'

// Themed pill. The visual treatment is a NAMED style in theme.pill.styles, selected
// by `activeStyle` ('blue' | 'green' | 'orange' | 'red' | 'gray', the status kinds, plus
// brand variants like 'status_good' | 'tier_1'). The old `color` alias was removed
// 2026-10-14 (every caller passes activeStyle). The
// entire look — including a leading status dot via `::before` on the status variants —
// lives in the style's `wrapper` class, so a site theme re-skins every pill at once.
// LOCKED (2026-10-14, ui-control-pills.md): the look is theme.pill[activeStyle] only — a `className`
// prop is dropped, never merged (owner rule: no UI component lets className override the theme).
export default function Pill ({ activeStyle, text, onClick, className, ...rest }) {
    warnLockedClassName('Pill', className);
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...pillTheme.styles[0], ...getComponentTheme(themeFromContext, 'pill', activeStyle) };
    return (
        <span
            className={`${t.wrapper}${onClick ? ' cursor-pointer' : ''}`}
            onClick={onClick}
            {...rest}
        >
            {text}
        </span>
    )
}
