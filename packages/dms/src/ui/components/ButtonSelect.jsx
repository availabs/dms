import * as Headless from '@headlessui/react'
import React, { forwardRef } from 'react'
import {ThemeContext} from '../useTheme'
import Button from "./Button";

const buttonSelectTheme = {

}

export default function ButtonSelect({ options=[], value, onChange=()=>{} }) {
    const { theme: themeFromContext = {buttonSelect: buttonSelectTheme}} = React.useContext(ThemeContext);
    const theme = {...themeFromContext, buttonSelect: {...buttonSelectTheme, ...(themeFromContext.buttonSelect || {})}};
    return (
        <div className={'flex divide-x-2 divide-y-2'}>
            {
                options.map(option =>
                    <Button key={option.value || option} onClick={() => onChange(option?.value || option)}
                            className={value === (option?.value || option) ? `bg-slate-200` : `bg-slate-50`}
                            type={'plain'}
                    >
                        {option?.label || option}
                    </Button>)
            }
        </div>
    )
}
