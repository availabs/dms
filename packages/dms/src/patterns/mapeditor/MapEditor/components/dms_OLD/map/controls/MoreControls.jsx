import React, {useRef, useState, useContext} from "react";
import {ArrowDown} from "../tmp-cache-files/icons.jsx"
import {ToggleControl} from "../tmp-cache-files/controls.jsx";
import {MapContext} from "../MapComponent.jsx";
import {useHandleClickOutside} from "../tmp-cache-files/utils.jsx";
import { HEIGHT_OPTIONS, PANEL_POSITION_OPTIONS } from '../MapComponent.jsx'

export default function MoreControls() {
    const {state, setState} = useContext(MapContext);
    const arePluginsLoaded = Object.values((state.symbologies || {})).some(symb => Object.keys((symb?.symbology?.plugins || {})).length > 0);
    console.log("morecontrol state, are plugs loaded::", state, arePluginsLoaded)
    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));
    /*
    * Height, draft.height
    * Disable zoom/pan, draft.zoomPan
    * Set Initial Viewport, draft.setInitialBounds, draft.initialBounds
    * Use blank basemap draft.blankBaseMap
    * Legend position
    * Plugin position (if applicable)
    * */
    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    More <ArrowDown id={menuBtnId} height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[14rem] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}

            >
                <div key={'more'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    <div className={`inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular 
                            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}>
                        <label>Height</label>
                        <select className={'bg-transparent p-1'}
                                value={state.height}
                                onChange={e => setState((draft) => {
                                    draft.height = e.target.value;
                                })}
                        >
                            {
                                Object.keys(HEIGHT_OPTIONS).map(option =>  <option key={option} value={option}>{option}</option>)
                            }
                        </select>
                    </div>
                    <div className={`inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular 
                            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}>
                        <label>Legend Position</label>
                        <select className={'bg-transparent p-1'}
                                value={state.legendPosition}
                                onChange={e => setState((draft) => {
                                    draft.legendPosition = e.target.value;
                                })}
                        >
                            {
                                Object.keys(PANEL_POSITION_OPTIONS).map(option =>  <option key={option} value={option}>{option}</option>)
                            }
                        </select>
                    </div>
                    {arePluginsLoaded && (<div className={`inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular 
                            text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}>
                        <label>Plugin Control Position</label>
                        <select className={'bg-transparent p-1'}
                                value={state.pluginControlPosition}
                                onChange={e => setState((draft) => {
                                    draft.pluginControlPosition = e.target.value;
                                })}
                        >
                            {
                                Object.keys(PANEL_POSITION_OPTIONS).map(option =>  <option key={option} value={option}>{option}</option>)
                            }
                        </select>
                    </div>)}
                    <ToggleControl title={'Zoom/pan'} value={state?.zoomPan}
                                   setValue={value => setState((draft) => {
                                       draft.zoomPan = value;
                                   })}/>

                    <ToggleControl title={'Set initial viewport'} value={state?.setInitialBounds}
                                   setValue={value => setState((draft) => {
                                       draft.setInitialBounds = value;
                                       if(!value){
                                           draft.initialBounds = undefined;
                                       }
                                   })}/>

                    <ToggleControl title={'Use blank basemap'} value={state?.blankBaseMap}
                                   setValue={value => setState((draft) => {
                                       draft.blankBaseMap = value;
                                   })}/>

                    <ToggleControl title={'Zoom to Fit'} value={state?.zoomToFitBounds}
                                   setValue={value => setState((draft) => {
                                       draft.zoomToFitBounds = value;
                                   })}/>
                </div>
            </div>
        </div>
    )
}
