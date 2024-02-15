import React, {useEffect, useState} from "react"
import {isJson} from "../index";
import { dmsDataTypes } from "../../../../index.js"
import Header from './header'

export const RenderCalloutBox = ({text = {}, backgroundColor, ...rest}) => {
    return (
        <div
            className={'flex justify-center items-center w-fit overflow-wrap p-5'}
            style={{minHeight: '150px', minWidth: '100px', maxWidth: '500px', backgroundColor: backgroundColor}}>
            <div className={`overflow-wrap break-word text-${text.size}`} style={{color: text.color}}>
                {text.text}
            </div>
        </div>
    )

}

export const parseJson = (val)  => {
    try {
        return JSON.parse(val);
    } catch (e) {
        return {};
    }
  
}

const RenderColorPicker = ({title, className, color, setColor}) => (
    <div className={className}>
        <label className={'shrink-0 pr-2 w-1/4'}>{title}</label>
        <input id={'background'} list="colors"
               className={'rounded-md shrink'}
               type={'color'} value={color} onChange={e => setColor(e.target.value)}/>
        <datalist id="colors">
            {
                [
                    // blues
                    '#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6','#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff',

                    // yellows
                    '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#fefce8',


                ].map(c => <option key={c}>{c}</option>)
            }
        </datalist>
    </div>
)

const Edit = ({value, onChange}) => {
    const cachedData = parseJson(value)
    const emptyTextBlock = {text: '', size: '4xl', color: '000000'};
    const [bgColor, setBgColor] = useState(cachedData?.bgColor || '#fff');
    const [text, setText] = useState(cachedData?.text || value || emptyTextBlock);

    useEffect(() => {
        onChange(JSON.stringify({bgColor, text}))
    }, [bgColor, text])

    const LexicalComp = dmsDataTypes.lexical.EditComp;

    return (
        <div className='w-full'>
            <div className='relative'>
                <RenderColorPicker 
                    title={'Background: '}
                    className={'w-full px-2 py-1 flex flex-row text-sm items-center border border-dashed'}
                    color={bgColor} setColor={setBgColor}/>
                    <LexicalComp value={text} onChange={setText} bgColor={bgColor}/>
            </div>
        </div>
    )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

const View = ({value}) => {
    if (!value) return ''
    let data = typeof value === 'object' ?
        value['element-data'] :
        JSON.parse(value)
    const dataOrValue = data?.text || value;

    if(!dataOrValue ||
        (dataOrValue?.root?.children?.length === 1 && dataOrValue?.root?.children?.[0]?.children?.length === 0) ||
        (dataOrValue?.root?.children?.length === 0)
    ) return null;

    const LexicalComp = dmsDataTypes.lexical.ViewComp;
    return (
        <div>
            <LexicalComp value={dataOrValue} bgColor={data?.bgColor} />
        </div>
    )
}


const lexical  = {
    "name": 'Rich Text',
    "EditComp": Edit,
    "ViewComp": View
}
 const ComponentRegistry = {
    lexical,
    "Header: Default Header": Header
}


export default ComponentRegistry