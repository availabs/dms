import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";

const Modal = ({ open, setOpen, columns, addCalculatedColumn }) => {
  const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const {Icon} = UI;
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
        <div className={t.dialogBackdrop} onClick={() => setOpen(false)}>
            <div className={t.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <div className={t.dialogCloseRow}>
                    <div className={t.dialogClose} onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </div>
                </div>

                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Calculated Column</div>
                    {t.dialogCloseRow === 'hidden' ? <div className={t.dialogClose} onClick={() => setOpen(false)}><Icon icon={'XMark'} height={12} width={12} /></div> : null}
                </div>
                    <div className={t.calcBody}>
                        <textarea className={t.calcTextarea} placeholder={'Please enter sql...'} value={state.name} onChange={e => setState(draft => {draft.name = e.target.value})}/>
                        <div className={t.dialogActions}>
                            {/* Clear Button */}
                            <button className={t.clearBtn} onClick={() => {
                                setState(draft => {
                                    draft.name = '';
                                })
                            }}>
                                Clear
                            </button>
                            {/* Save Button */}
                            <button disabled={!isValidSql} className={isValidSql ? t.saveBtn : t.saveBtnDisabled} onClick={handleSave}>
                                Add
                            </button>
                        </div>
                    </div>
            </div>
        </div>
    );
};

const AddCalculatedColumn = ({columns=[], addCalculatedColumn}) => {
    const [open, setOpen] = useState(false);
    const {UI} = useContext(ThemeContext);
    const {Pill} = UI;
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            {t.addTrigger
                ? <button type='button' className={t.addTrigger} onClick={() => setOpen(true)}>+ Calculated</button>
                : <Pill text={'+ Calculated'} color={'blue'} onClick={() => setOpen(true)}/>}
            {open && <Modal open={open} setOpen={setOpen} columns={columns} addCalculatedColumn={addCalculatedColumn}/>}
        </>
    )
}

export default AddCalculatedColumn
