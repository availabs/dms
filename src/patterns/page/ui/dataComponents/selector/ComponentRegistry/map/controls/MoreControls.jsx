import React, {useRef, useState, useEffect, useContext, useCallback} from "react";
import {ArrowDown} from "../../../../../../../forms/ui/icons"
import {ToggleControl} from "../../../dataWrapper/components/ToggleControl";
import {InputControl} from "../../../dataWrapper/components/InputControl";
import {MapContext} from "../MapComponent";
import {useHandleClickOutside} from "../../shared/utils";

export default function MoreControls() {
    const {state, setState} = useContext(MapContext);

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));
    /*
    * Height, draft.height
    * Disable zoom/pan, draft.zoomPan
    * Set Initial Viewport, draft.setInitialBounds, draft.initialBounds
    * Use blank basemap draft.blankBaseMap
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
                                ['full', '1', '2/3', '1/3', '1/4'].map(option =>  <option key={option} value={option}>{option}</option>)
                            }
                        </select>
                    </div>

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
