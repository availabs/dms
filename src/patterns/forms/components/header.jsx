import React, {useMemo, useState, useEffect, useRef} from 'react'
import {Link} from "react-router-dom";
import {Delete} from "../../admin/ui/icons";

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
                buttons.map((button, i) => <RenderButton key={i} {...button} />)
            }
        </div>
    </div>
)

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [title, setTitle] = useState(cachedData.title || '');
    const [buttons, setButtons] = useState(cachedData.buttons || []); //{to, text}
    useEffect(() => {
        onChange(JSON.stringify({
            ...cachedData, title, buttons
        }))
    }, [title, buttons]);

    return (
        <div>
            <div>
                <div className={'border flex justify-between'}>
                    <input className={'p-2 w-full'} placeholder={'Please enter title...'} value={title}
                           onChange={e => setTitle(e.target.value)}/>
                    <button className={'bg-blue-300 hover:bg-blue-600 text-white rounded-md'} onClick={() => setButtons([...buttons, {to: '', text: ''}])}>add button</button>
                </div>
                {
                    buttons.map((button, i) => (
                        <div className={'flex'}>
                            <input className={'p-2'}
                                   placeholder={'text'}
                                   value={button.text}
                                   onChange={e => setButtons(
                                       [
                                           ...buttons.map((b, bI) => i === bI ? {...b, text: e.target.value} : b)
                                       ])}/>
                            <input className={'p-2'}
                                   placeholder={'link'}
                                   value={button.to}
                                   onChange={e => setButtons(
                                       [...buttons.map((b, bI) => i === bI ? {...b, to: e.target.value} : b)
                                       ])}/>
                            <button onClick={(() => setButtons(buttons.filter((b,bI) => bI !== i)))}><Delete className={'text-red-300 hover:text-red-600'}/></button>
                        </div>
                    ))
                }
            </div>

            <RenderHeader title={title} buttons={buttons}/>
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
    "name": 'Header: Title',
    "type": 'Header',
    "variables": [
        {name: 'title'}
    ],
    "EditComp": Edit,
    "ViewComp": View
}