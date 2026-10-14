import React from 'react'
import {ThemeContext, getComponentTheme} from '../useTheme'
import {buttonSelectTheme} from './ButtonSelect.theme'
import Button from "./Button";

export default function ButtonSelect({ options=[], value, onChange=()=>{}, disabled=false, activeStyle }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = { ...buttonSelectTheme.styles[0], ...getComponentTheme(themeFromContext, 'buttonSelect', activeStyle) };
    return (
        <div className={theme.wrapper}>
            {
                options.map(option => {
                    const isActive = value === (option?.value || option);
                    return (
                        <Button key={option.value || option}
                                disabled={disabled}
                                onClick={() => !disabled && onChange(option?.value || option)}
                                activeStyle={isActive ? theme.buttonActiveStyle : theme.buttonStyle}
                        >
                            {option?.label || option}
                        </Button>
                    )
                })
            }
        </div>
    )
}
