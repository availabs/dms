import React, {useEffect, useState} from "react"
import { dmsDataTypes } from "~/modules/dms/src"
import {ColorPickerComp} from "./components/colorPickerComp";
import theme from './theme'
import RenderSwitch from "../shared/Switch";
const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const Edit = ({value, onChange}) => {
    const cachedData = value && isJson(value) ? JSON.parse(value) : {}
    const emptyTextBlock = {text: '', size: '4xl', color: '000000'};
    const [bgColor, setBgColor] = useState(cachedData?.bgColor || 'rgba(0,0,0,0)');
    const [isCard, setIsCard] = useState(cachedData?.isCard);
    const [text, setText] = useState(cachedData?.text || value || emptyTextBlock);

    useEffect(() => {
        onChange(JSON.stringify({bgColor, text, isCard}))
    }, [bgColor, text])

    const LexicalComp = dmsDataTypes.lexical.EditComp;

    // add is card toggle
    return (
        <div className='w-full'>
            <div className='relative'>
                <div className={'flex w-full px-2 py-1 flex flex-row text-sm items-center'}>
                    <label className={'shrink-0 pr-2 w-1/4'}>Is Card</label>
                    <div className={''}>
                        <RenderSwitch
                            size={'small'}
                            id={'is-card-toggle'}
                            enabled={isCard}
                            setEnabled={(value) => setIsCard(value)}
                        />
                    </div>
                </div>
                {
                    isCard ?
                        <ColorPickerComp className={'w-full px-2 py-1 flex flex-row text-sm items-center'}
                                         color={bgColor} setColor={setBgColor} title={'Background'}
                        /> : null
                }
                    <LexicalComp value={text} onChange={setText} bgColor={bgColor} theme={{lexical: theme}}/>
            </div>
        </div>
    )
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

const View = ({value}) => {
    if (!value) return <div className='h-6' />
    let data = typeof value === 'object' ?
        value['element-data'] :
        JSON.parse(value)
    const dataOrValue = data?.text || value;

    if(!dataOrValue ||
        (dataOrValue?.root?.children?.length === 1 && dataOrValue?.root?.children?.[0]?.children?.length === 0) ||
        (dataOrValue?.root?.children?.length === 0)
    ) return <div className='h-6' />;

    const LexicalComp = dmsDataTypes.lexical.ViewComp;
    return (
        <div>
            <LexicalComp value={dataOrValue} bgColor={data?.bgColor} theme={{lexical: theme}}/>
        </div>
    )
}


export default {
    "name": 'Rich Text',
    "EditComp": Edit,
    "ViewComp": View
}