import RenderSwitch from "./Switch";
import React from "react";

export const RenderAllowSearchParamsControls = ({allowSearchParams, setAllowSearchParams}) => setAllowSearchParams ? (
    <div>
        <div
            className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 bg-white hover:bg-gray-50 cursor-pointer`}
            onClick={() => setAllowSearchParams(!allowSearchParams)}
        >
            <span className={'flex-1 select-none mr-1'}>Use Search Params </span>
            <RenderSwitch
                size={'small'}
                enabled={allowSearchParams}
                setEnabled={() => {
                }}
            />
        </div>
    </div>
) : null;