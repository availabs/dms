import React, {useRef, useState, useContext, useCallback} from "react";
import {ToggleControl} from "../../../dataWrapper/components/ToggleControl";
import {InputControl} from "../../../dataWrapper/components/InputControl";
import {useHandleClickOutside} from "../../shared/utils";
import {CMSContext, ComponentContext} from "../../../../../../context";

const DomainEditor = ({value, setValue, display}) => {
    const [newTick, setNewTick] = useState('');
    const {UI} = useContext(CMSContext);
    const {Icon} = UI;

    return display.useCustomXDomain ? (
        <>
        {
            (value || []).map((tick, i) =>
                <div key={i} className={'flex gap-0.5 items-center'}>
                    <InputControl value={tick} setValue={v => setValue(display.xDomain.map((d,ii) => i === ii ? v : d))}/>
                    <Icon icon={'TrashCan'} className={'size-6 text-red-500 hover:text-red-700 cursor-pointer'}
                          onClick={() => setValue(value.filter((_, ii) => i !== ii))}
                    />
                </div>)
        }
        <div className={'flex gap-0.5 items-center'}>
            <InputControl value={newTick} setValue={v => setNewTick(v)} onKeyDown={(e) => {
                if(e.key === 'Enter') {
                    setValue([...(value || []), newTick])
                    setNewTick('')
                }
            }} placeHolder={'tick'}/>
            <Icon icon={'CirclePlus'} className={'size-6 text-blue-500 hover:text-blue-700 cursor-pointer'}
                  tabindex={0}
                  onClick={() => {
                      setValue([...(value || []), newTick])
                      setNewTick('')
                  }}
            />
        </div>
        </>
    )  : null
}
export default function AppearanceControls({context}) {
    const {state: {display}, setState} = useContext(context || ComponentContext);
    const {UI} = useContext(CMSContext);
    const {Icon} = UI;

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);

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

    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    Appearance <Icon icon={'ArrowDown'} id={menuBtnId} height={18} width={18} className={'mt-1'}/>
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
                    <InputControl title={'Label'} type={'text'} value={display.xAxis?.label}
                                  setValue={value => updateDisplayValue('xAxis', 'label', value)}/>
                    <InputControl title={'Tick Spacing'} type={'number'} value={display.xAxis?.tickSpacing}
                                  setValue={value => updateDisplayValue('xAxis', 'tickSpacing', +value)}/>
                    <ToggleControl title={'Show Gridlines'} value={display.xAxis?.showGridLines}
                                   setValue={value => updateDisplayValue('xAxis', 'showGridLines', value)}/>
                    <ToggleControl title={'Rotate Labels'} value={display.xAxis?.rotateLabels}
                                   setValue={value => updateDisplayValue('xAxis', 'rotateLabels', value)}/>
                    <ToggleControl title={'Show Axis Bar'} value={display.xAxis?.showXAxisBar}
                                   setValue={value => updateDisplayValue('xAxis', 'showXAxisBar', value)}/>

                    {/* Y Axis */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Y Axis</div>
                    </div>
                    <InputControl title={'Label'} type={'text'} value={display.yAxis?.label}
                                  setValue={value => updateDisplayValue('yAxis', 'label', value)}/>
                    <InputControl title={'Tick Spacing'} type={'number'} value={display.yAxis?.tickSpacing}
                                  setValue={value => updateDisplayValue('yAxis', 'tickSpacing', +value)}/>
                    <div
                        className={`group inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
                    >
                        <span className={'flex-0 select-none mr-1'}>Tick Format</span>
                        <select
                            className={'flex-1 p-1 text-end w-full rounded-md bg-white group-hover:bg-gray-50 cursor-pointer'}
                            value={display.yAxis?.tickFormat}
                            onChange={e => updateDisplayValue('yAxis', 'tickFormat', e.target.value)}
                        >
                            {
                                [
                                    {label: 'Default', value: ''},
                                    {label: 'Abbreviate', value: 'abbreviate'},
                                    {label: 'Comma Separated', value: 'comma'},
                                ].map(({label, value}) => <option key={value} value={value}>{label}</option>)
                            }
                        </select>
                    </div>
                    <ToggleControl title={'Show Gridlines'} value={display.yAxis?.showGridLines}
                                   setValue={value => updateDisplayValue('yAxis', 'showGridLines', value)}/>
                    <ToggleControl title={'Rotate Labels'} value={display.yAxis?.rotateLabels}
                                   setValue={value => updateDisplayValue('yAxis', 'rotateLabels', value)}/>

                    {/* Graph */}
                    <div className={'border-t mt-2 mx-4'}>
                        <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Graph</div>
                    </div>
                    <InputControl title={'Title'} type={'text'} value={display.title?.title}
                                  setValue={value => updateDisplayValue('title', 'title', value)}/>

                    <ToggleControl title={'Legend'} value={display.legend?.show}
                                   setValue={value => updateDisplayValue('legend', 'show', value)}/>

                    <ToggleControl title={'Tooltip'} value={display.tooltip?.show}
                                   setValue={value => updateDisplayValue('tooltip', 'show', value)}/>
                    <ToggleControl title={'Attribution'} value={display.showAttribution}
                                   setValue={value => updateDisplayValue(null, 'showAttribution', value)}/>
                    <ToggleControl title={'Scale Filter'} value={display.showScaleFilter}
                                   setValue={value => updateDisplayValue(null, 'showScaleFilter', value)}/>
                    <InputControl title={'Height'} type={'number'} value={display.height}
                                  setValue={value => updateDisplayValue(null, 'height', +value)}/>
                    <ToggleControl title={'Always Fetch Data'} value={display.readyToLoad}
                                   setValue={value => updateDisplayValue(null, 'readyToLoad', value)}/>
                    <ToggleControl title={'Dark Mode'} value={display.darkMode}
                                   setValue={value => updateDisplayValue(null, 'darkMode', value)}/>
                    <ToggleControl title={'Use Custom X ticks'} value={display.useCustomXDomain}
                                   setValue={value => updateDisplayValue(null, 'useCustomXDomain', value)}/>

                    <DomainEditor value={display.xDomain}
                                  setValue={value => updateDisplayValue(null, 'xDomain', value)}
                                  display={display}
                    />
                    {/* Layout */}
                    {
                        display.graphType === 'BarGraph' ?
                            <>
                                <div className={'border-t mt-2 mx-4'}>
                                    <div className={'-mt-2 -ml-4 px-2 text-xs font-medium font-gray-800 w-fit bg-white'}>Layout</div>
                                </div>
                                <ToggleControl title={'Vertical'} value={display.orientation === 'vertical'}
                                               setValue={value => updateDisplayValue(null, 'orientation', value ? 'vertical' : 'horizontal')}/>

                                <ToggleControl title={'Stacked'} value={display.groupMode === 'stacked'}
                                               setValue={value => updateDisplayValue(null, 'groupMode', value ? 'stacked' : 'grouped')}/>

                                <ToggleControl title={'Log Scale'} value={display.isLog}
                                               setValue={value => updateDisplayValue(null, 'isLog', value)}/>
                            </> : null
                    }
                </div>
            </div>
        </div>
    )
}
