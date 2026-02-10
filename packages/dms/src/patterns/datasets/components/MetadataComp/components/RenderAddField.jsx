import React, {useContext, useState} from "react";
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";
import {metadataCompTheme} from "../metadataComp.theme";

export const RenderAddField = ({placeHolder, attributes=[], className, addAttribute}) => {
    const {UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = theme?.datasets?.metadataComp || metadataCompTheme;
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
        <div className={t.addFieldRow}>
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
            <Button className={error ? t.addButtonError : t.addButton} onClick={e => fn()}>
                {
                    error ?
                        <div className={t.addButtonContent}><Icon icon={'Alert'} className={t.addButtonIcon}/> {error} </div> :
                        <div className={t.addButtonContent}><Icon icon={'Add'} className={t.addButtonIcon}/> {'add'}</div>
                }
            </Button>
        </div>)
}
