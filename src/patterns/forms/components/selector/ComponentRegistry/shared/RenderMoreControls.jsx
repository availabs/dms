import React, {useRef, useState, useEffect, useContext, useCallback} from "react";
import {ArrowDown} from "../../../../ui/icons"
import {RenderToggleControls} from "./RenderToggleControls";
import RenderSwitch from "./Switch";
import {RenderInputControls} from "./RenderInputControls";
import {SpreadSheetContext} from "../spreadsheet";
import {getControlConfig, useHandleClickOutside} from "./utils";

export default function RenderMoreControls({context}) {
    const {state: {display}, setState, compType} = useContext(context || SpreadSheetContext);
    const {
        allowShowTotalToggle,
        allowStripedToggle,
        allowDownloadToggle,
        allowEditInViewToggle,
        allowSearchParamsToggle,
        allowUsePaginationToggle,
        allowPageSizeInput,
        allowDataSizeInput=false
    } = getControlConfig(compType);

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const updateDisplayValue = useCallback((key, value) => {
        setState(draft => {
            draft.display[key] = value;
        })
    }, []);

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
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >

                <div key={'more'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {allowEditInViewToggle ?
                            <RenderToggleControls title={'Allow Edit'} value={display.allowEditInView}
                                                  setValue={value => updateDisplayValue('allowEditInView', value)}/> : null}
                    {allowSearchParamsToggle ?
                        <RenderToggleControls title={'Use Search Params'} value={display.allowSearchParams}
                                              setValue={value => updateDisplayValue('allowSearchParams', value)}/> : null}
                    {allowShowTotalToggle ?
                        <RenderToggleControls title={'Show Total'} value={display.showTotal}
                                              setValue={value => updateDisplayValue('showTotal', value)}/> : null}
                    {allowStripedToggle ?
                        <RenderToggleControls title={'Striped'} value={display.striped}
                                              setValue={value => updateDisplayValue('striped', value)}/> : null}
                    {allowDownloadToggle ?
                        <RenderToggleControls title={'Allow Download'} value={display.allowDownload}
                                              setValue={value => updateDisplayValue('allowDownload', value)}/> : null}
                    {allowUsePaginationToggle ?
                        <RenderToggleControls title={'Use Pagination'} value={display.usePagination}
                                              setValue={value => updateDisplayValue('usePagination', value)}/> : null}
                    {allowPageSizeInput ?
                        <RenderInputControls title={'Page Size'} type={'number'} value={display.pageSize}
                                             setValue={value => updateDisplayValue('pageSize', +value)}
                                             displayCdn={display.usePagination === true}/> : null}
                    {allowDataSizeInput ?
                        <RenderInputControls title={'Data Size'} type={'number'} value={display.dataSize}
                                             setValue={value => updateDisplayValue('dataSize', +value)}/> : null}
                </div>
            </div>
        </div>
    )
}
