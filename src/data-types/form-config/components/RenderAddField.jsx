import React, {useState} from "react";
import {Add, Alert} from "../../../patterns/admin/ui/icons";

export const RenderAddField = ({theme, placeholder, attributes=[], className, addAttribute}) => {
    const [newValue, setNewValue] = useState('');
    const [error, setError] = useState('empty name');
    function fn() {
        addAttribute({name: newValue});
        setNewValue('');
        setError('empty name')
        if (document.activeElement !== document.body) document.activeElement.blur();
    }

    const triggerAddEvent = () => setTimeout(fn, 500)
    return (
        <div className={'w-full flex flex-col sm:flex-row'}>
            <input
                className={`w-1/4 p-2 border ${error ? 'border-red-500' : ''} rounded-md`}
                value={newValue}
                placeholder={placeholder}
                onChange={e => {
                    if(attributes.find(a => a.name === e.target.value)) {
                        setError('already exists');
                    }else if (e.target.value === ''){
                        setError('empty name')
                    }else if(error) {
                        setError(null)
                    }

                    setNewValue(e.target.value.toLowerCase().replaceAll(/\s+/g, ' '));
                }}
                onBlur={e => {
                    if(e.target.value !== '' && !error){
                        triggerAddEvent()
                    }
                }}
                onKeyDown={e =>  !error && e.key === 'Enter' && triggerAddEvent()}
            />
            <button className={`p-2 ${error ? 'bg-red-500' : 'bg-blue-300 hover:bg-blue-500'} text-white rounded-md`} onClick={e => fn()}>
                {
                    error ?
                        <div className={'flex items-center '}><Alert className={'text-white px-1'}/> {error} </div> :
                        <div className={'flex items-center '}><Add className={'text-white px-1'}/> {'add'}</div>
                }
            </button>
        </div>)
}