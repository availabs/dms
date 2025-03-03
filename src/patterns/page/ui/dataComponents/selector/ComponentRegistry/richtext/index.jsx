import React, {useEffect, useState} from "react"
import LexicalComp from "./lexical"
import {ColorPickerComp} from "./components/colorPickerComp";
import theme from './theme'
import RenderSwitch from "../shared/Switch";
import {merge, cloneDeep} from 'lodash-es'
const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}


const cardTheme = {
    editorContainer: "relative block rounded-[12px] min-h-[50px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]", //'.editor-shell .editor-container'
    editorViewContainer: "overflow-hidden relative block rounded-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]", // .editor-shell .view-container
    heading: {
        h1: "pl-[16px] pt-[8px] font-[500]  text-[#2D3E4C] text-[36px] leading-[40px]  font-[500]  uppercase font-['Oswald'] pb-[12px]", //'PlaygroundEditorTheme__h1',
        h2: "pl-[16px] pt-[8px] font-[500]  text-[#2D3E4C] text-[24px] leading-[24px] scroll-mt-36 font-['Oswald']", //'PlaygroundEditorTheme__h2',
        h3: "pl-[16px] pt-[8px] font-[500]  text-[#2D3E4C] text-[16px]  font-['Oswald']", //'PlaygroundEditorTheme__h3',
        h4: "pl-[16px] pt-[8px] font-medium text-[#2D3E4C] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h4',
        h5: "pl-[16px] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h5',
        h6: "pl-[16px] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h6',
    },
}

const Edit = ({value, onChange}) => {
    const cachedData = value && isJson(value) ? JSON.parse(value) : {}
    const emptyTextBlock = {text: '', size: '4xl', color: '000000'};
    const [bgColor, setBgColor] = useState(cachedData?.bgColor || 'rgba(0,0,0,0)');
    const [isCard, setIsCard] = useState(cachedData?.isCard);
    const [text, setText] = useState(cachedData?.text || value || emptyTextBlock);

    useEffect(() => {
        onChange(JSON.stringify({bgColor, text, isCard}))
    }, [bgColor, text, isCard])

    

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
                    <LexicalComp.EditComp value={text} onChange={setText} bgColor={bgColor} theme={{lexical: isCard ? merge(cloneDeep(theme), cloneDeep(cardTheme)) : theme}}/>
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
    const isCard = data?.isCard

    console.log('richtext view ', isCard, data)

    if(!dataOrValue ||
        (dataOrValue?.root?.children?.length === 1 && dataOrValue?.root?.children?.[0]?.children?.length === 0) ||
        (dataOrValue?.root?.children?.length === 0)
    ) return <div className='h-6' />;

    
    return (
        <LexicalComp.ViewComp value={dataOrValue} bgColor={data?.bgColor} theme={{lexical: isCard ? merge(cloneDeep(theme), cloneDeep(cardTheme)) : theme}}/>
    )
}


export default {
    "name": 'Rich Text',
    "EditComp": Edit,
    "ViewComp": View
}