import React, {useState} from "react";
import {Add, Alert} from "../../../patterns/admin/ui/icons";

export const RenderAddField = ({theme, placeholder, attributes, className, addAttribute}) => {
    const [newValue, setNewValue] = useState('');
    const [alreadyExists, setAlreadyExists] = useState(false);
    function fn() {
        addAttribute({name: newValue});
        setNewValue('');
        if (document.activeElement !== document.body) document.activeElement.blur();
    }

    const triggerAddEvent = () => setTimeout(fn, 500)
    return (
        <div className={'w-full flex flex-col sm:flex-row'}>
            <input
                className={`w-1/4 p-2 border ${alreadyExists ? 'border-red-500' : ''} rounded-md`}
                value={newValue}
                placeholder={placeholder}
                onChange={e => {
                    if(attributes.find(a => a.name === e.target.value)) {
                        setAlreadyExists(true);
                    }else if(alreadyExists) {
                        setAlreadyExists(false)
                    }

                    setNewValue(e.target.value);
                }}
                onBlur={e => {
                    if(e.target.value !== '' && !alreadyExists){
                        triggerAddEvent()
                    }
                }}
                onKeyDown={e =>  !alreadyExists && e.key === 'Enter' && triggerAddEvent()}
            />
            <button disabled={alreadyExists} className={`flex items-center p-2 ${alreadyExists ? 'bg-red-500' : 'bg-blue-300 hover:bg-blue-500'} text-white rounded-md`} onClick={e => fn()}>
                {
                    alreadyExists ?
                        <><Alert className={'text-white px-1'}/> already exists</> :
                        <><Add className={'text-white px-1'}/> add</>
                }
            </button>
        </div>)
}