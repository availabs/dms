import React, {useContext, useState} from "react";
import {DatasetsContext} from "../../../context";

export const RenderAddField = ({theme, placeHolder, attributes=[], className, addAttribute}) => {
    const {UI} = useContext(DatasetsContext);
    const [newValue, setNewValue] = useState('');
    const [error, setError] = useState('empty name');
    
    const {Input, Button, Icon} = UI;
    
    function fn() {
        addAttribute({name: newValue});
        setNewValue('');
        setError('empty name')
        if (document.activeElement !== document.body) document.activeElement.blur();
    }

    const triggerAddEvent = () => setTimeout(fn, 500)
    return (
        <div className={'w-full flex flex-col sm:flex-row'}>
            <Input
                value={newValue}
                placeHolder={placeHolder}
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
            <Button className={`p-2 ${error ? 'bg-red-500' : 'bg-blue-300 hover:bg-blue-500'} text-white rounded-md`} onClick={e => fn()}>
                {
                    error ?
                        <div className={'flex items-center '}><Icon icon={'Alert'} className={'text-white px-1 size-6'}/> {error} </div> :
                        <div className={'flex items-center '}><Icon icon={'Add'} className={'text-white px-1 size-6'}/> {'add'}</div>
                }
            </Button>
        </div>)
}