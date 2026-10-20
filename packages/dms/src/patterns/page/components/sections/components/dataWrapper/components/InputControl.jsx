import React, {useContext} from "react";
import {ThemeContext} from "../../../../../../../ui/useTheme";

// A labelled one-line value control (section "More" settings, graph x-axis ticks). The field is UI.Input `compact`
// (2026-10-16, ui-raw-html-to-ui-components.md: was a raw <input> with an `inputClassName` override nothing passed).
export const InputControl = ({type, placeHolder, value, setValue, coerce, title, className, onKeyDown, displayCdn=true, ...rest}) => {
    const { UI } = useContext(ThemeContext) || {};
    if (!setValue || !displayCdn) return null;
    return (
        <div>
            <div
                className={className || `inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
                text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
            >
                <span className={'flex-1 select-none mr-1 w-fit'}>{title}</span>
                <span className={'flex-1 min-w-0'}>
                    <UI.Input
                        activeStyle="compact"
                        aria-label={typeof title === 'string' ? title : undefined}
                        type={type}
                        placeholder={placeHolder}
                        value={value}
                        // `coerce` (when supplied) owns the raw->stored conversion: it clamps to
                        // min/max and maps a blank field to undefined ("unset"). Without it the
                        // historical behavior is kept verbatim — note `+''` is 0, which is exactly
                        // the trap coerce exists to avoid for bounded numeric controls.
                        onChange={e => setValue(coerce ? coerce(e.target.value) : (type === 'number' ? +e.target.value : e.target.value))}
                        onKeyDown={onKeyDown}
                        onWheel={e => e.target.blur()}
                        {...rest}
                    />
                </span>
            </div>
        </div>
    );
};
