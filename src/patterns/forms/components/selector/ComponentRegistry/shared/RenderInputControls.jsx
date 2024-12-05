import RenderSwitch from "./Switch";
import React from "react";

export const RenderInputControls = ({value, setValue, title, displayCdn=true}) => setValue && displayCdn ? (
    <div>
        <div
            className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
        >
            <span className={'flex-1 select-none mr-1'}>{title}</span>
            <input className={'p-0.5'}
                   value={value}
                   onChange={e => setValue(e.target.value)}
                   onWheel={e => e.target.blur()}
            />
        </div>
    </div>
) : null;