import React, {useEffect, useState} from "react"
import LexicalComp from "./lexical"
import {ColorPickerComp} from "./components/colorPickerComp";
import theme from './theme'
import RenderSwitch from "../../dataWrapper/components/Switch";
import { Select } from  '../../../../' 
import {merge, cloneDeep} from 'lodash-es'

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const cardTypes = {
    'Dark': {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0bh resize-y", //'editor-scroller'
        viewScroller:
            "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
        editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
        editorShell: "font-['Proxima_Nova'] font-[400] text-[16px] text-white leading-[22.4px]",
        heading: {
            h1: "pt-[8px] font-[500] text-[64px] text-white leading-[40px]  font-[500]  uppercase font-['Oswald'] pb-[12px]", //'PlaygroundEditorTheme__h1',
            h2: "pt-[8px] font-[500] text-[24px] text-white leading-[24px] scroll-mt-36 font-['Oswald']", //'PlaygroundEditorTheme__h2',
            h3: "pt-[8px] font-[500] text-[16px]  text-white font-['Oswald']", //'PlaygroundEditorTheme__h3',
            h4: "pt-[8px] font-medium scroll-mt-36 text-white font-display", //'PlaygroundEditorTheme__h4',
            h5: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h5',
            h6: "scroll-mt-36 font-display", //'PlaygroundEditorTheme__h6',
        },
        
    },
   'Annotation' : {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorContainer: "relative block rounded-[12px] min-h-[50px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]", //'.editor-shell .editor-container'
        editorViewContainer: "relative block rounded-[12px] shadow-[0px_0px_6px_0px_rgba(0,0,0,0.02),0px_2px_4px_0px_rgba(0,0,0,0.08)]", // .editor-shell .view-container
       
        paragraph: "m-0 relative px-[12px]",
        layoutContainer: 'grid',
        layoutItem: 'border-b border-slate-300 min-w-0 max-w-full',
        editor: {
            inlineImage: {
              base: "inline-block relative z-10 cursor-default select-none -mx-[12px]"
            }
        },
          heading: {
            h1: "pl-[16px] pt-[8px] font-[500] text-[34px] text-[#2D3E4C] leading-[40px]  font-[500]  uppercase font-['Oswald'] pb-[12px]", //'PlaygroundEditorTheme__h1',
            h2: "pl-[16px] pt-[8px] font-[500] text-[24px] text-[#2D3E4C] leading-[24px] scroll-mt-36 font-['Oswald']", //'PlaygroundEditorTheme__h2',
            h3: "pl-[16px] pt-[8px] font-[500] text-[16px]  text-[#2D3E4C] font-['Oswald']", //'PlaygroundEditorTheme__h3',
            h4: "pl-[16px] pt-[8px] font-medium scroll-mt-36 text-[#2D3E4C] font-display", //'PlaygroundEditorTheme__h4',
            h5: "pl-[16px] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h5',
            h6: "pl-[16px] scroll-mt-36 font-display", //'PlaygroundEditorTheme__h6',
        },
    },
    'Handwritten': {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0bh resize-y", //'editor-scroller'
        viewScroller:
            "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
        editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
        editorShell: "font-['Rock_Salt'] font-[400] text-[13px] text-[#37576B] leading-[22.4px]",
        
    },
    'Handwritten_1': {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0bh resize-y", //'editor-scroller'
        viewScroller:
            "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
        editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
        editorShell: "font-['Grape_Nuts'] font-[600] text-[18px] text-[#37576B] leading-[22.4px]",
    },
    'Handwritten_2': {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0bh resize-y", //'editor-scroller'
        viewScroller:
            "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
        editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
        editorShell: "font-['Caveat'] font-[600] text-[20px] text-[#37576B] leading-[22.4px]",
    },
    'Handwritten_3': {
        contentEditable: 'border-none relative [tab-size:1] outline-none ',
        editorScroller: "min-h-[150px] border-0 flex relative outline-0 z-0bh resize-y", //'editor-scroller'
        viewScroller:
            "border-0 flex relative outline-0 z-0 resize-none", //.view-scroller
        editorContainer: "relative block rounded-[10px] min-h-[50px]", //'.editor-shell .editor-container'
        editorShell: "font-['Shadows_Into_Light_Two'] font-[600] text-[15px] text-[#37576B] leading-[22.4px]",
    }
    
}

const Edit = ({value, onChange}) => {
    const cachedData = value && isJson(value) ? JSON.parse(value) : {}
    const emptyTextBlock = {text: '', size: '4xl', color: '000000'};
    const [bgColor, setBgColor] = useState(cachedData?.bgColor || 'rgba(0,0,0,0)');
    const [isCard, setIsCard] = useState(cachedData?.isCard || '');
    const [text, setText] = useState(cachedData?.text || value || emptyTextBlock);

    useEffect(() => {

        onChange(JSON.stringify({bgColor, text, isCard}))
    }, [bgColor, text, isCard])

    

    // add is card toggle
    return (
        <div className='w-full'>
            <div className='relative'>
                <div className={'flex w-full px-2 py-1 flex flex-row text-sm items-center'}>
                    <label className={'shrink-0 pr-2 w-1/4'}>Style</label>
                    <div className={''}>
                        <Select 
                            options={[
                              {
                                label: 'Default Text',
                                value: ''
                              },
                              {
                                label: 'Dark Text',
                                value: 'Dark'
                              },
                              {
                                label: 'Annotation Card',
                                value: 'Annotation'
                              },
                              {
                                label: 'Handwritten (Rock Salt)',
                                value: 'Handwritten'
                              },
                              {
                                label: 'Handwritten (Grape Nuts)',
                                value: 'Handwritten_1'
                              },
                              {
                                label: 'Handwritten (Caveat)',
                                value: 'Handwritten_2'
                              },
                              {
                                label: 'Handwritten (Shadows Two)',
                                value: 'Handwritten_3'
                              },
                            ]}
                            value={isCard}
                            onChange={e => {
                                e.target.value !== 'Annotation' && setBgColor('rgba(0,0,0,0)')
                                setIsCard(e.target.value)}
                            }
                        />
                    </div>
                </div>
                {
                    isCard ?
                        <ColorPickerComp className={'w-full px-2 py-1 flex flex-row text-sm items-center'}
                                         color={bgColor} setColor={setBgColor} title={'Background'}
                        /> : null
                }
                <div className='flex'>
                    {isCard === 'Handwritten' && <div className='w-[50px]'> {'<---'} </div>}
                    <div className='flex-1'>
                        <LexicalComp.EditComp 
                            value={text} 
                            onChange={setText} 
                            bgColor={bgColor} 
                            theme={{
                                lexical: isCard ? 
                                    merge(cloneDeep(theme), cloneDeep(cardTypes?.[isCard] || cardTypes?.['Annotation'])) : 
                                    theme
                            }}
                        />
                    </div>
                </div>
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

    //console.log('richtext view ', isCard, data)

    if(!dataOrValue ||
        (dataOrValue?.root?.children?.length === 1 && dataOrValue?.root?.children?.[0]?.children?.length === 0) ||
        (dataOrValue?.root?.children?.length === 0)
    ) return <div className='h-6' />;

    

    return (
        <div className='flex'>
            {['Handwritten', 'Handwritten_1', 'Handwritten_2', 'Handwritten_3'].includes(isCard)  && <div className='pt-2 pr-2'><img src='/themes/mny/handwritten_arrow.svg'/></div>}
            <div className='flex-1'>
            <LexicalComp.ViewComp 
                value={dataOrValue} 
                bgColor={data?.bgColor} 
                theme={{
                    lexical: isCard ? 
                         merge(cloneDeep(theme), cloneDeep(cardTypes?.[isCard] || cardTypes?.['Annotation'])) :
                        theme
                }}/>
            </div>
        </div>
    )
}


export default {
    "name": 'Rich Text',
    "EditComp": Edit,
    "ViewComp": View
}