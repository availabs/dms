import React, {useMemo, useState} from "react";
import { ColorPicker } from "../../../../../";
const defaultColorOptions = [
 "#FFFFFF",
    "#F3F8F9", // #2D3E4C
    // "#C5D7E0", // #37576B - left border for notes
    "#FCF6EC" // #EAAD43 - left border for notes
//     #6D96AE - dashed border
];
export const ColorPickerComp = ({title, className, color, colors, setColor}) => {
    const [open, setOpen] = useState(false);
    const colorOptions = useMemo(() => colors || defaultColorOptions, [colors]);

    return (
        <div className={className}>
            <label className={'shrink-0 pr-2 w-1/4'}>{title}</label>
            <div className={''}>
                <div id={'background'}
                     className={'shrink w-[30px] h-[30px] border rounded-md'}
                     style={{backgroundColor: color}}
                     onClick={() => setOpen(!open)}
                />
                {
                    open ? (
                        <div className={'absolute z-[25]'}>
                            <ColorPicker color={color} onChange={setColor} colors={colorOptions} showColorPicker={false}/>
                        </div>
                    ) : null
                }
            </div>
        </div>
    )
}