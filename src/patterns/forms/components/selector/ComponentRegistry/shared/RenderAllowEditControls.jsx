import RenderSwitch from "./Switch";
import React from "react";

export const RenderAllowEditControls = ({allowEditInView, setAllowEditInView}) => (
    <div>
        <div
            className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 bg-white hover:bg-gray-50 cursor-pointer`}
            onClick={() => setAllowEditInView(!allowEditInView)}
        >
            <span className={'flex-1 select-none mr-1'}>Allow Edit </span>
            <RenderSwitch
                size={'small'}
                enabled={allowEditInView}
                setEnabled={() => {
                }}
            />
        </div>
    </div>
)