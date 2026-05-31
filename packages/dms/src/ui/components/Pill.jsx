import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme'
import { pillTheme } from './Pill.theme'

// Themed pill. The visual treatment is a NAMED style in theme.pill.styles, selected
// by `activeStyle` — or, for back-compat, by the legacy `color` prop (color names
// double as style names: 'blue' | 'green' | 'orange' | 'red' | 'gray', plus brand
// variants like 'status_good' | 'status_bad' | 'status_warn' | 'status_na'). The
// entire look — including a leading status dot via `::before` on the status variants —
// lives in the style's `wrapper` class, so a site theme re-skins every pill at once.
export default function Pill ({ color, activeStyle, text, onClick, ...rest }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...pillTheme.styles[0], ...getComponentTheme(themeFromContext, 'pill', activeStyle ?? color) };
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
