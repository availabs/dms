import RenderSwitch from "./Switch";
import React from "react";

export const ToggleControl = ({value, setValue, title, className}) => setValue ? (
    <div>
        <div
            className={className || `inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
            onClick={() => setValue(!value)}
        >
            <span className={'flex-1 select-none mr-1'}>{title}</span>
            <RenderSwitch
                size={'small'}
                enabled={value}
                setEnabled={() => {
                }}
            />
        </div>
    </div>
) : null;