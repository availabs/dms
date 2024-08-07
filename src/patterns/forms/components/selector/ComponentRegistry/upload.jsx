import React, {useMemo, useState, useEffect, useRef} from 'react'
import {Link} from "react-router-dom";
import {Delete} from "../../../../admin/ui/icons";

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const RenderButton = ({to, text}) => (
    <Link className={'p-2 mx-1 bg-blue-300 hover:bg-blue-600 text-white rounded-md'} to={to}>{text}</Link>
)
const RenderHeader = ({title, buttons=[]}) => (
    <div className={'w-full flex justify-between border-b rounded-l-lg pr-2'}>
        <div>
            <span
                className={'text-3xl text-blue-500 text-bold tracking-wide border-b-4 border-blue-500 px-2'}>{title.substring(0, 1)}</span>
            <span
                className={'text-3xl -ml-2 text-blue-500 text-bold tracking-wide'}>{title.substring(1, title.length)}</span>
        </div>
        <div>
            {
                buttons.map(button => <RenderButton {...button} />)
            }
        </div>
    </div>
)

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    // const cachedData = isJson(value) ? JSON.parse(value) : {};
    // useEffect(() => {
    //     onChange(JSON.stringify({
    //         ...cachedData
    //     }))
    // }, []);

    return (
        <div className={'w-full h-[300px]'}>

            <div className="flex items-center justify-center w-full">
                <label htmlFor="dropzone-file"
                       className="flex flex-col items-center justify-center w-full h-96 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" aria-hidden="true"
                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                  d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                        </svg>
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or
                            drag and drop</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">SVG, PNG, JPG or GIF (MAX.
                            800x400px)</p>
                    </div>
                    <input id="dropzone-file" type="file" className="hidden"/>
                </label>
            </div>


        </div>
    )
}

const View = ({value, format, apiLoad, ...rest}) => {
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const {title, buttons} = cachedData;
    return (
        <RenderHeader title={title} buttons={buttons}/>
    )

}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Upload',
    "type": 'Upload',
    "variables": [],
    "EditComp": Edit,
    "ViewComp": Edit
}