import React, {useRef, useState, useEffect, useContext, useCallback} from "react";
import {ArrowDown} from "../../../../../../forms/ui/icons"
import {RenderToggleControls} from "./RenderToggleControls";
import RenderSwitch from "./Switch";
import {RenderInputControls} from "./RenderInputControls";
import {SpreadSheetContext} from "../spreadsheet";
import {getControlConfig, useHandleClickOutside} from "./utils";

export default function RenderAppearanceControls({context}) {
    const {state: {display}, setState, compType} = useContext(context || SpreadSheetContext);

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    // const [openSubMenu, setOpenSubMenu]
    const menuBtnId = 'menu-btn-appearance-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const updateDisplayValue = useCallback((parentKey, key, value) => {
        setState(draft => {
            if(!parentKey) {
                draft.display[key] = value;
            } else if(draft.display[parentKey]){
                draft.display[parentKey][key] = value;
            } else{
                draft.display[parentKey] = {[key]: value};
            }
        })
    }, []);


    if(compType !== 'graph') return;
    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    Appearance <ArrowDown id={menuBtnId} height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <div key={'appearance'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    <div
                        className={`group inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
                    >
                        <span className={'flex-0 select-none mr-1'}>Type</span>
                        <select
                            className={'flex-1 p-1 text-end w-full rounded-md bg-white group-hover:bg-gray-50 cursor-pointer'}
                            value={display.graphType}
                            onChange={e => updateDisplayValue(null, 'graphType', e.target.value)}
                        >
                            {
                                [
                                    {label: 'Bar', value: 'BarGraph'},
                                    {label: 'Line', value: 'LineGraph'},
                                    {label: 'Scatter', value: 'ScatterPlot'},
                                ].map(({label, value}) => <option key={value} value={value}>{label}</option>)
                            }
                        </select>
                    </div>
                    {/* X Axis */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>X Axis</div>
                    </div>
                    <RenderInputControls title={'Label'} type={'text'} value={display.xAxis?.label}
                                         setValue={value => updateDisplayValue('xAxis', 'label', value)}/>
                    <RenderInputControls title={'Tick Spacing'} type={'number'} value={display.xAxis?.tickSpacing}
                                         setValue={value => updateDisplayValue('xAxis', 'tickSpacing', +value)}/>
                    <RenderToggleControls title={'Show Gridlines'} value={display.xAxis?.showGridLines}
                                          setValue={value => updateDisplayValue('xAxis', 'showGridLines', value)}/>
                    <RenderToggleControls title={'Rotate Labels'} value={display.xAxis?.rotateLabels}
                                          setValue={value => updateDisplayValue('xAxis', 'rotateLabels', value)}/>

                    {/* Y Axis */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Y Axis</div>
                    </div>
                    <RenderInputControls title={'Label'} type={'text'} value={display.yAxis?.label}
                                         setValue={value => updateDisplayValue('yAxis', 'label', value)}/>
                    <RenderInputControls title={'Tick Spacing'} type={'number'} value={display.yAxis?.tickSpacing}
                                         setValue={value => updateDisplayValue('yAxis', 'tickSpacing', +value)}/>
                    <RenderToggleControls title={'Show Gridlines'} value={display.yAxis?.showGridLines}
                                          setValue={value => updateDisplayValue('yAxis', 'showGridLines', value)}/>
                    <RenderToggleControls title={'Rotate Labels'} value={display.yAxis?.rotateLabels}
                                          setValue={value => updateDisplayValue('yAxis', 'rotateLabels', value)}/>

                    {/* Title */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Title</div>
                    </div>
                    <RenderInputControls title={'Title'} type={'text'} value={display.title?.title}
                                         setValue={value => updateDisplayValue('title', 'title', value)}/>

                    {/* Legend */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Legend</div>
                    </div>
                    <RenderToggleControls title={'Show'} value={display.legend?.show}
                                          setValue={value => updateDisplayValue('legend', 'show', value)}/>

                    {/* Tooltip */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Tooltip</div>
                    </div>
                    <RenderToggleControls title={'Show'} value={display.tooltip?.show}
                                          setValue={value => updateDisplayValue('tooltip', 'show', value)}/>

                    {/* Layout */}
                    {
                        display.graphType === 'BarGraph' ?
                            <>
                                <div className={'border-t mt-2 mx-4'}>
                                    <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Layout</div>
                                </div>
                                <RenderToggleControls title={'Vertical'} value={display.orientation === 'vertical'}
                                                      setValue={value => updateDisplayValue(null, 'orientation', value ? 'vertical' : 'horizontal')}/>

                                <RenderToggleControls title={'Stacked'} value={display.groupMode === 'stacked'}
                                                      setValue={value => updateDisplayValue(null, 'groupMode', value ? 'stacked' : 'grouped')}/>
                            </> : null
                    }
                </div>
            </div>
        </div>
    )
}
