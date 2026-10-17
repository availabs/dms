import React, {useContext, useRef, useState} from "react";
import { useImmer } from "use-immer";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";

const CalculatedDialog = ({ open, setOpen, columns, addCalculatedColumn }) => {
  const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const {Icon, Button, Textarea, Modal} = UI;
    const sqlField = useRef(null);   // Modal focuses it on open
    // mounted only while open (parent) — no early return before the hooks below
    const [state, setState] = useImmer({
     type: 'calculated',
        show: true
    });

    // Save and close modal
    const handleSave = () => {
        addCalculatedColumn(state);
        setOpen(false);
    };
    const isValidSql = true;

    return (
        <Modal open={open} setOpen={setOpen} activeStyle="aboveMenu" initialFocus={sqlField}>
            <div className={t.dialogBody}>
                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Calculated Column</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </Button>
                </div>
                    <div className={t.calcBody}>
                        <Textarea activeStyle="mono" rows={6} aria-label="SQL" ref={sqlField} placeholder={'Please enter sql...'} value={state.name || ''} onChange={e => setState(draft => {draft.name = e.target.value})}/>
                        <div className={t.dialogActions}>
                            {/* Clear Button */}
                            <Button activeStyle="action" onClick={() => {
                                setState(draft => {
                                    draft.name = '';
                                })
                            }}>
                                Clear
                            </Button>
                            {/* Save Button */}
                            <Button activeStyle="primary" disabled={!isValidSql} onClick={handleSave}>
                                Add
                            </Button>
                        </div>
                    </div>
            </div>
        </Modal>
    );
};

// triggerStyle / triggerOnStyle (2026-10-17): a caller that lays these out as pills beside its own (CardColumnPicker's
// "+ Static" chip) names the Button styles; the trigger then sits unwrapped (no full-width addTriggerWrap)
const AddCalculatedColumn = ({columns=[], addCalculatedColumn, triggerStyle, triggerOnStyle}) => {
    const [open, setOpen] = useState(false);
    const {UI} = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            {triggerStyle
                ? <UI.Button activeStyle={(open && triggerOnStyle) || triggerStyle} aria-expanded={open} onClick={() => setOpen(true)}>+ Calculated</UI.Button>
                : <span className={t.addTriggerWrap}>
                    <UI.Button activeStyle="actionFull" aria-expanded={open} onClick={() => setOpen(true)}>+ Calculated</UI.Button>
                  </span>}
            {open && <CalculatedDialog open={open} setOpen={setOpen} columns={columns} addCalculatedColumn={addCalculatedColumn}/>}
        </>
    )
}

export default AddCalculatedColumn
