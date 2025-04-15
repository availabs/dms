import React, {useRef, useState, useEffect, useContext, useCallback} from "react";
import {ArrowDown} from "../../../../../../../forms/ui/icons"
import {ToggleControl} from "../../../dataWrapper/components/ToggleControl";
import {InputControl} from "../../../dataWrapper/components/InputControl";
import {MapContext} from "../MapComponent";
import {useHandleClickOutside} from "../../shared/utils";

export default function FilterControls() {
    const {state, setState} = useContext(MapContext);

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-filter-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const activeSym = Object.keys(state.symbologies || {}).find(sym => state.symbologies[sym].isVisible);
    const activeSymSymbology = state.symbologies[activeSym]?.symbology;
    const activeLayer = activeSymSymbology?.layers?.[activeSymSymbology?.activeLayer];
    const interactiveFilterOptions = (activeLayer?.['interactive-filters'] || []);
    const dynamicFilterOptions = (activeLayer?.['dynamic-filters'] || []);
    const activeFilter = activeLayer?.selectedInteractiveFilterIndex;

    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    Filters <ArrowDown id={menuBtnId} height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[20rem] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}

            >
                <div key={'filters'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">

                    <ToggleControl title={'Use Search Params'} value={activeLayer?.useSearchParams}
                                   setValue={value => setState((draft) => {
                                       draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].useSearchParams = value;
                                   })}/>
                    <InputControl title={'Search Param Key'} type={'text'} value={activeLayer?.searchParamKey}
                                  setValue={value => setState((draft) => {
                                      draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].searchParamKey = value;
                                  })}/>

                    <div className={'grid grid-cols-3 gap-1 px-2 py-1 text-gray-700'}>
                        <div className={'text-sm font-semibold'}>Interactive Filter</div>
                        <div className={'text-sm font-semibold'}>Search Param Value</div>
                        <div className={'text-sm font-semibold justify-self-end'}>Active</div>

                        {
                            interactiveFilterOptions.map((filter, fI) => (
                                <>
                                    <div className={'text-sm'}>{filter.label}</div>
                                    <input className={'text-sm'}
                                           placeholder={'search param key'}
                                           value={filter.searchParamValue || filter.label}
                                           onChange={e => {
                                               setState((draft) => {
                                                   draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]['interactive-filters'][fI].searchParamValue = e.target.value;
                                               })
                                           }}/>
                                    <ToggleControl value={activeFilter === fI}
                                                   setValue={value => value ? setState((draft) => {
                                                       draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer].selectedInteractiveFilterIndex = fI;
                                                   }) : null}/>
                                </>
                            ))
                        }
                    </div>

                    <div className={'grid grid-cols-3 gap-1 px-2 py-1 text-gray-700'}>
                        <div className={'text-sm font-semibold'}>Dynamic Filter</div>
                        <div className={'text-sm font-semibold'}>Search Param Value</div>
                        <div className={'text-sm font-semibold'}>Default Value</div>

                        {
                            dynamicFilterOptions.map((filter, fI) => (
                                <>
                                    <div className={'text-sm'}>{filter.display_name || filter.column_name}</div>
                                    <input className={'text-sm'}
                                           placeholder={'search param key'}
                                           value={filter.searchParamKey || filter.column_name}
                                           onChange={e => {
                                               setState((draft) => {
                                                   draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]['dynamic-filters'][fI].searchParamKey = e.target.value;
                                               })
                                           }}/>

                                    <input className={'text-sm'}
                                           placeholder={'default value'}
                                           value={filter.defaultValue}
                                           onChange={e => {
                                               setState((draft) => {
                                                   const value = e.target.value?.length ? e.target.value : undefined;
                                                   draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]['dynamic-filters'][fI].defaultValue = value;
                                                   draft.symbologies[activeSym].symbology.layers[activeSymSymbology?.activeLayer]['dynamic-filters'][fI].values = value ? [value] : [];
                                               })
                                           }}/>
                                </>
                            ))
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}
