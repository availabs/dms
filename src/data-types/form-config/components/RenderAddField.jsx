import React, {useState} from "react";

export const RenderAddField = ({theme, item, placeholder, className, addAttribute}) => {
    const [newValue, setNewValue] = useState('');

    function fn() {
        addAttribute({name: newValue});
        setNewValue('');
        if (document.activeElement !== document.body) document.activeElement.blur();
    }

    const triggerAddEvent = () => setTimeout(fn, 500)
    return (
        <div className={'w-full flex flex-col sm:flex-row'}>
            <input
                className={'w-1/4 border p-2 rounded-md'}
                value={newValue}
                placeholder={placeholder}
                onChange={e => {setNewValue(e.target.value)}}
                onBlur={e => {
                    if(e.target.value !== ''){
                        triggerAddEvent()
                    }
                }}
            />

            <button className={'bg-blue-300 hover:bg-blue-500 text-white'} onClick={e => fn()}>+ add</button>
        </div>)
}