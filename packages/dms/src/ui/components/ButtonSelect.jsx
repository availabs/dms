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
        <div className={'flex gap-0.5'}>
            {
                options.map(option =>
                    <Button key={option.value || option}
                            onClick={() => onChange(option?.value || option)}
                            activeStyle={value === (option?.value || option) ? 'active' : 'plain'}
                    >
                        {option?.label || option}
                    </Button>)
            }
        </div>
    )
}
