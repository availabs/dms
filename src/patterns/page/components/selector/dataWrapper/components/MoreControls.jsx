import React, {useContext, useCallback} from "react";
import {ToggleControl} from "./ToggleControl";
import {InputControl} from "./InputControl";
import {ComponentContext} from "../../../../context";
import {ThemeContext} from "../../../../../../ui/useTheme"

export default function MoreControls({context}) {
    const {state: {display}, setState, controls} = useContext(context || ComponentContext);
    const { UI } = React.useContext(ThemeContext) || {UI: {Icon: () => <></>}};
    if(!controls.more?.length) return;

    const { Icon, Button, Popup } = UI;

    const updateDisplayValue = useCallback((key, value, onChange) => {
        setState(draft => {
            draft.display[key] = value;

            if(key === 'allowEditInView' && value){
                draft.columns.forEach(column => {
                    column.allowEditInView = true;
                })
            }

            if(onChange) {
                onChange({key, value, state: draft})
            }
        })
    }, []);

    return (
        <div className="relative inline-block text-left">
            <Popup button={
                <Button type={'transparent'}
                        className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular
                        ring-1 ring-inset ring-gray-300
                 text-gray-900 shadow-sm bg-white hover:bg-gray-50 cursor-pointer`}>
                More <Icon icon='ArrowDown' height={18} width={18} className={'mt-1'}/>
                </Button>}
            >
                {({open, setOpen}) => (
                    <div
                        className={`${open ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
                    >

                        <div key={'more'} className="py-1 text-sm max-h-[500px] overflow-auto scrollbar-sm">
                            {
                                controls.more
                                    .filter(({displayCdn}) =>
                                        typeof displayCdn === 'function' ? displayCdn({display}) :
                                            typeof displayCdn === 'boolean' ? displayCdn : true)
                                    .map(({type, inputType, label, key, options, onChange, ...rest}) =>
                                        type === 'toggle' ?
                                            <ToggleControl key={key} title={label} value={display[key]}
                                                           setValue={value => updateDisplayValue(key, value, onChange)}/> :
                                            type === 'input' ?
                                                <InputControl key={key} type={inputType} title={label} value={display[key]} setValue={value => updateDisplayValue(key, value)} {...rest}/> :
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
                )}
            </Popup>
        </div>
    )
}
