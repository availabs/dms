import React, {useContext, useState} from "react";
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";
import {metadataCompTheme} from "../metadataComp.theme";

export const RenderAddField = ({placeHolder, attributes=[], className, addAttribute, disabled=false}) => {
    const {UI} = useContext(DatasetsContext);
    const {theme} = useContext(ThemeContext) || {};
    const t = { ...metadataCompTheme, ...(theme?.datasets?.metadataComp || {}) };
    const [newValue, setNewValue] = useState('');
    const [error, setError] = useState('empty name');

    const {Input, Button, Icon} = UI;

    function fn() {
        if (disabled) return;
        addAttribute({name: newValue});
        setNewValue('');
        setError('empty name')
        if (document.activeElement !== document.body) document.activeElement.blur();
    }

    const triggerAddEvent = () => !disabled && setTimeout(fn, 500)
    if (disabled) return null;
    const input = (
        <Input
            value={newValue}
            placeholder={placeHolder}
            aria-invalid={error === 'already exists' || undefined}
            onChange={e => {
                if(attributes.find(a => a.name === e.target.value)) {
                    setError('already exists');
                }else if (e.target.value === ''){
                    setError('empty name')
                }else if(error) {
                    setError(null)
                }

                setNewValue(e.target.value.replaceAll(/\s+/g, ' '));
            }}
            onBlur={e => {
                if(e.target.value !== '' && !error){
                    triggerAddEvent()
                }
            }}
            onKeyDown={e =>  !error && e.key === 'Enter' && triggerAddEvent()}
        />
    );

    // v6: plain "add" button, disabled while the name is empty or taken; "already exists" shows
    // under the input. addFieldBtn '' → the pre-v6 button that carries the error itself.
    if (t.addFieldBtn) {
        return (
            <div>
                <div className={t.addFieldRow}>
                    <div className={t.addFieldInputWrap}>{input}</div>
                    <Button className={t.addFieldBtn} disabled={!!error} title={error || undefined} onClick={() => !error && fn()}>
                        <div className={t.addButtonContent}><Icon icon={'Add'} className={t.addButtonIcon}/>add</div>
                    </Button>
                </div>
                {error === 'already exists' ? <div className={t.addFieldError}>already exists</div> : null}
            </div>
        )
    }
    return (
        <div className={t.addFieldRow}>
            {input}
            <Button activeStyle={error ? 'danger' : 'active'} onClick={e => fn()}>
                {
                    error ?
                        <div className={t.addButtonContent}><Icon icon={'Alert'} className={t.addButtonIcon}/> {error} </div> :
                        <div className={t.addButtonContent}><Icon icon={'Add'} className={t.addButtonIcon}/> {'add'}</div>
                }
            </Button>
        </div>)
}
