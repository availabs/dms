import * as Headless from '@headlessui/react'
import React, { forwardRef } from 'react'
import {ThemeContext} from '../useTheme'
import Button from "./Button";

const buttonSelectTheme = {

}

export const docs = {
  options: [
    {label: 'Option 1', value: 1},
    {label: 'Option 2', value: 2},
    {label: 'Option 3', value: 3},
    {label: 'Option 4', value: 4}
  ],
  multiple: false
}

export default function ButtonSelect({ options=[], value, onChange=()=>{} }) {
    const { theme: themeFromContext = {buttonSelect: buttonSelectTheme}} = React.useContext(ThemeContext);
    const theme = {...themeFromContext, buttonSelect: {...buttonSelectTheme, ...(themeFromContext.buttonSelect || {})}};
    console.log('value', value)
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
