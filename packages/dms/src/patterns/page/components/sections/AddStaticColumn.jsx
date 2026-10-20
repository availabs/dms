import React, { useContext, useRef, useState } from "react";
import { useImmer } from "use-immer";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { columnManagerTheme } from "./ColumnManager.theme";

const StaticDialog = ({ open, setOpen, addStaticColumn }) => {
    const { UI } = useContext(ThemeContext);
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    const { Icon, Button, Input, FieldLabel, Modal } = UI;
    const firstField = useRef(null);   // Modal focuses it on open (autoFocus would hide the opener from its focus return)
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
        <Modal open={open} setOpen={setOpen} activeStyle="aboveMenu" initialFocus={firstField}>
            <div className={t.dialogBody}>
                <div className={t.dialogHeader}>
                    <div className={t.dialogTitle}>Add Static Column</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </Button>
                </div>

                <div className={t.staticBody}>
                    <div className={t.staticField}>
                        <FieldLabel activeStyle="inline" htmlFor="static-col-name" text="Display name" />
                        <Input
                            id="static-col-name"
                            ref={firstField}
                            placeholder="e.g. Category"
                            value={state.display_name}
                            onChange={e => setState(draft => { draft.display_name = e.target.value; })}
                        />
                    </div>
                    <div className={t.staticField}>
                        <FieldLabel activeStyle="inline" htmlFor="static-col-value" text="Static value" />
                        <Input
                            id="static-col-value"
                            placeholder="Value shown for every row"
                            value={state.staticValue}
                            onChange={e => setState(draft => { draft.staticValue = e.target.value; })}
                        />
                    </div>
                    <div className={t.dialogActions}>
                        <Button activeStyle="action" onClick={handleClear}>
                            Clear
                        </Button>
                        <Button activeStyle="primary" disabled={!isValid} onClick={handleSave}>
                            Add
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const AddStaticColumn = ({ addStaticColumn }) => {
    const [open, setOpen] = useState(false);
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...columnManagerTheme, ...getComponentTheme(themeFromContext, 'pages.columnManager') };
    return (
        <>
            <span className={t.addTriggerWrap}>
                <UI.Button activeStyle="actionFull" aria-expanded={open} onClick={() => setOpen(true)}>
                    + Static
                </UI.Button>
            </span>
            {open && <StaticDialog open={open} setOpen={setOpen} addStaticColumn={addStaticColumn} />}
        </>
    );
};

export default AddStaticColumn;
