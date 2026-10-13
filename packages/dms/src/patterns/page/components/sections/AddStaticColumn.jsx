import React, { useContext, useState } from "react";
import { useImmer } from "use-immer";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";
import Input from "../../../../ui/components/Input";

const Modal = ({ open, setOpen, addStaticColumn }) => {
    const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { Icon } = UI;
    // mounted only while open (parent) — no early return before the hooks below
    const [state, setState] = useImmer({
        display_name: '',
        staticValue: '',
    });

    const isValid = !!state.display_name.trim();

    const handleSave = () => {
        if (!isValid) return;
        const name = `static_${state.display_name.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        addStaticColumn({
            name,
            display_name: state.display_name.trim(),
            staticValue: state.staticValue,
            origin: 'static',
            show: true,
        });
        setOpen(false);
    };

    const handleClear = () => {
        setState(draft => {
            draft.display_name = '';
            draft.staticValue = '';
        });
    };

    return (
        <div className={t.dialogBackdrop} onClick={() => setOpen(false)}>
            <div className={t.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Static Column</div>
                    <div className={t.dialogClose} onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </div>
                </div>

                <div className={t.staticBody}>
                    <div className={t.staticField}>
                        <label className={t.staticLabel}>Display name</label>
                        <Input
                            placeholder="e.g. Category"
                            value={state.display_name}
                            onChange={e => setState(draft => { draft.display_name = e.target.value; })}
                        />
                    </div>
                    <div className={t.staticField}>
                        <label className={t.staticLabel}>Static value</label>
                        <Input
                            placeholder="Value shown for every row"
                            value={state.staticValue}
                            onChange={e => setState(draft => { draft.staticValue = e.target.value; })}
                        />
                    </div>
                    <div className={t.dialogActions}>
                        <button className={t.clearBtn} onClick={handleClear}>
                            Clear
                        </button>
                        <button disabled={!isValid} className={isValid ? t.saveBtn : t.saveBtnDisabled} onClick={handleSave}>
                            Add
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AddStaticColumn = ({ addStaticColumn }) => {
    const [open, setOpen] = useState(false);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            <button
                className={t.addTrigger || `${t.staticTrigger} ${open ? t.staticTriggerOpen : ''}`}
                onClick={() => setOpen(true)}
            >
                + Static
            </button>
            {open && <Modal open={open} setOpen={setOpen} addStaticColumn={addStaticColumn} />}
        </>
    );
};

export default AddStaticColumn;
