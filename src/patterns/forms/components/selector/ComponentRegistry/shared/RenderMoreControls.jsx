import React, {useRef, useState, useEffect} from "react";
import {ArrowDown} from "../../../../ui/icons"
import {RenderToggleControls} from "./RenderToggleControls";
import RenderSwitch from "./Switch";
import {RenderInputControls} from "./RenderInputControls";

export default function RenderMoreControls({
   showTotal, setShowTotal,
   striped, setStriped,
   allowDownload, setAllowDownload,
   allowEditInView, setAllowEditInView,
   allowSearchParams, setAllowSearchParams,
   usePagination, setUsePagination,
   pageSize, setPageSize,
   dataSize, setDataSize,
}) {
    if (!setShowTotal && !setStriped && !setAllowDownload && !setAllowEditInView &&
        !setAllowSearchParams && !setUsePagination && !setPageSize && !setDataSize) return;

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'

    // ================================================== close on outside click start =================================
    const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target) && e.target.id !== menuBtnId) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // ================================================== close on outside click end ===================================

    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    More <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >

                <div key={'more'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    <RenderToggleControls title={'Allow Edit'} value={allowEditInView} setValue={setAllowEditInView}/>
                    <RenderToggleControls title={'Use Search Params'} value={allowSearchParams}
                                          setValue={setAllowSearchParams}/>
                    <RenderToggleControls title={'Show Total'} value={showTotal} setValue={setShowTotal}/>
                    <RenderToggleControls title={'Striped'} value={striped} setValue={setStriped}/>
                    <RenderToggleControls title={'Allow Download'} value={allowDownload} setValue={setAllowDownload}/>
                    <RenderToggleControls title={'Use Pagination'} value={usePagination} setValue={setUsePagination}/>
                    <RenderInputControls title={'Page Size'} value={pageSize} setValue={setPageSize} displayCdn={usePagination===true}/>
                    <RenderInputControls title={'Data Size'} value={dataSize} setValue={setDataSize}/>
                </div>
            </div>
        </div>
    )
}
