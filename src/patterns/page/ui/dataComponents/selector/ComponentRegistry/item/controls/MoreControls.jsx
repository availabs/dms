import React, {useRef, useState, useContext, useCallback} from "react";
import {useHandleClickOutside} from "../../shared/utils";
import {ArrowDown} from "../../../../../icons";
import {ToggleControl} from "../../../dataWrapper/components/ToggleControl";

export default function MoreControls({context}) {
    const {state: {display}, setState, compType} = useContext(context);
    const allowEditInViewToggle = true

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const updateDisplayValue = useCallback((key, value) => {
        setState(draft => {
            draft.display[key] = value;
        })
    }, []);

    if(compType === 'graph') return;
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

                <div key={'more'} className="py-1 text-sm max-h-[500px] overflow-auto scrollbar-sm">
                    {allowEditInViewToggle ?
                        <ToggleControl title={'Allow Edit'} value={display.allowEditInView}
                                       setValue={value => updateDisplayValue('allowEditInView', value)}/> : null}
                </div>
            </div>
        </div>
    )
}
