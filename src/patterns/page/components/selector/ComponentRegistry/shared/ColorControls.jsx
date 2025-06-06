import React, {useContext, useMemo, useState} from "react";
import {CMSContext} from "../../../../context";

const defaultColorOptions = [
    "#FFFFFF",
    "#F3F8F9",
    "#FCF6EC"
];
export default function ({value='#FFFFFF', setValue, title, className, colors}) {
    const {UI} = useContext(CMSContext);
    const {ColorPicker} = UI;
    if(!setValue) return;

    const [open, setOpen] = useState(false);
    const colorOptions = useMemo(() => colors || defaultColorOptions, [colors]);

    return (
        <div className={'px-1.5 py-1 w-full inline-flex justify-between items-center bg-white hover:bg-gray-50 cursor-pointer'}>
            <label className={'shrink-0'}>{title}</label>
            <div className={''}>
                <div id={'background'}
                     className={'shrink w-[30px] h-[30px] border rounded-md'}
                     style={{backgroundColor: value}}
                     onClick={() => setOpen(!open)}
                />
                {
                    open ? (
                        <div className={'absolute z-[25] shadow'}>
                            <ColorPicker color={value} onChange={setValue} colors={colorOptions} showColorPicker={false}/>
                        </div>
                    ) : null
                }
            </div>
        </div>
    )
}