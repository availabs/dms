import React, {useRef, useState, useEffect, useContext, useCallback} from "react";
import {ArrowDown} from "../../../../../../forms/ui/icons"
import {ToggleControl} from "./ToggleControl";
import {InputControl} from "./InputControl";
import {ComponentContext} from "../index";
import {useHandleClickOutside} from "../../ComponentRegistry/shared/utils";

export default function MoreControls({context}) {
    const {state: {display}, setState, controls} = useContext(context || ComponentContext);
    if(!controls.more?.length) return;

    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-more-controls'
    useHandleClickOutside(menuRef, menuBtnId, () => setIsOpen(false));

    const updateDisplayValue = useCallback((key, value, onChange) => {
        setState(draft => {
            draft.display[key] = value;

            if(onChange) {
                onChange({key, value, state: draft})
            }
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

                <div key={'more'} className="py-1 text-sm max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        controls.more
                            .filter(({displayCdn}) =>
                                typeof displayCdn === 'function' ? displayCdn({display}) :
                                 typeof displayCdn === 'boolean' ? displayCdn : true)
                            .map(({type, inputType, label, key, options, onChange}) =>
                            type === 'toggle' ?
                                <ToggleControl key={key} title={label} value={display[key]}
                                               setValue={value => updateDisplayValue(key, value, onChange)}/> :
                                type === 'input' ?
                                    <InputControl key={key} type={inputType} title={label} value={display[key]} setValue={value => updateDisplayValue(key, value)}/> :
                                    type === 'select' ?
                                        <div
                                            key={key}
                                            className={`group inline-flex w-full justify-between items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 bg-white hover:bg-gray-50 cursor-pointer`}
                                        >
                                            <span className={'flex-0 select-none mr-1'}>{label}</span>
                                            <select
                                                className={'flex-1 p-1 w-full rounded-md bg-white group-hover:bg-gray-50 cursor-pointer'}
                                                value={display[key]}
                                                onChange={e => updateDisplayValue(key, e.target.value, onChange)}
                                            >
                                                {
                                                    options.map(({label, value}) => <option key={value} value={value}>{label}</option>)
                                                }
                                            </select>
                                        </div> :
                                        typeof type === 'function' ? type({value: display[key], setValue: newValue => updateDisplayValue(key, newValue)}) :
                                            `${type} not available`
                        )
                    }
                </div>
            </div>
        </div>
    )
}
