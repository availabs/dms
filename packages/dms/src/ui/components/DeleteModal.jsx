import React, {useRef, useState} from "react";
import Modal from "./Modal";
import Icon from "./Icon";
import {ThemeContext, getComponentTheme} from "../useTheme";
import {deleteModalTheme} from "./DeleteModal.theme";

// `modalStyle`: the UI.Modal named style to open with — layering, not look: a confirmation launched from a popup /
// section menu passes 'aboveMenu' so it sits above the menu (2026-10-16).
export function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete, activeStyle, modalStyle})  {
    const cancelButtonRef = useRef(null)
    const [loading, setLoading] = useState(false)
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...deleteModalTheme.styles[0], ...getComponentTheme(themeFromContext, 'deleteModal', activeStyle) };
    return (
        <Modal
            open={open}
            setOpen={setOpen}
            initialFocus={cancelButtonRef}
            activeStyle={modalStyle}
        >
            <div className={t.content}>
                {t.icon && <div className={t.iconWrap}>
                    <Icon icon={t.icon} className={t.iconClass} aria-hidden="true" />
                </div>}
                <div className={t.textWrap}>
                    <h3 className={t.title}>
                        {title || `Delete ${item.title || ''} ${item.id}`}
                    </h3>
                    <p className={t.body}>
                        {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
                    </p>
                </div>
            </div>
            <div className={t.actions}>
                <button
                    type="button"
                    className={t.cancelButton}
                    onClick={() => setOpen(false)}
                    ref={cancelButtonRef}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={loading}
                    className={t.deleteButton}
                    onClick={onDelete}
                >
                    Delet{loading ? 'ing...' : 'e'}
                </button>
            </div>
        </Modal>
    )

}
