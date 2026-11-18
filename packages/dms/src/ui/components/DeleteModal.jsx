import React, {useRef, useState} from "react";
import Modal from "./Modal";
import Icon from "./Icon";
import Button from "./Button";
import {ThemeContext, getComponentTheme} from "../useTheme";
import {deleteModalTheme} from "./DeleteModal.theme";

// `modalStyle`: the UI.Modal named style to open with — layering, not look: a confirmation launched from a popup /
// section menu passes 'aboveMenu' so it sits above the menu (2026-10-16).
//
// `items`: everything the delete takes with it, `[{ id, label, detail?, blocked?, reason? }]`, listed under the
// prompt with `itemsTitle` above. Any `blocked` item disables Delete; `blockedNote` (or a default naming the
// blocked items) says why. `onDelete` may return a promise: Delete shows "Deleting..." until it settles, and a
// rejection is shown in the dialog instead of being lost (safe-delete-removes-rows.md, F3). `notes`: lines under the
// list (e.g. what is kept); `disabled` holds Delete (a plan still loading); `error` shows a caller's error (a failed plan).
// `prompt={null}` leaves out the prompt line; an empty or missing prompt shows the default.
export function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete, activeStyle, modalStyle, items, itemsTitle, blockedNote, disabled, notes, error: errorProp})  {
    const cancelButtonRef = useRef(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const blocked = (items || []).filter(i => i?.blocked)
    const runDelete = async () => {
        setError(null)
        setLoading(true)
        try {
            await onDelete?.()
        } catch (e) {
            setError(e?.message && e.message !== '[object Object]' ? e.message : 'The delete was refused. Nothing was deleted.')
        } finally {
            setLoading(false)
        }
    }
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
                    {/* prompt={null} hides the line (a dialog with nothing true to say there, e.g. a failed plan) */}
                    {prompt === null ? null : <p className={t.body}>
                        {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
                    </p>}
                    {items?.length ? (
                        <>
                            {itemsTitle ? <div className={t.listTitle}>{itemsTitle}</div> : null}
                            <ul className={t.list}>
                                {items.map((i, idx) => (
                                    <li key={i.id ?? idx} className={i.blocked ? t.listItemBlocked : t.listItem}>
                                        <span className={t.listItemLabel}>{i.label}</span>
                                        {i.blocked
                                            ? <span className={t.listItemReason}>{i.reason || 'blocked'}</span>
                                            : (i.detail ? <span className={t.listItemDetail}>{i.detail}</span> : null)}
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : null}
                    {blocked.length ? (
                        <p className={t.blockedNote}>
                            {blockedNote || `Can't delete: ${blocked.map(i => i.label).join(', ')} ${blocked.length > 1 ? 'are' : 'is'} blocking it.`}
                        </p>
                    ) : null}
                    {(notes || []).filter(Boolean).map((n, i) => <p key={i} className={t.note}>{n}</p>)}
                    {error || errorProp ? <p className={t.error}>{error || errorProp}</p> : null}
                </div>
            </div>
            <div className={t.actions}>
                <Button
                    activeStyle={t.cancelButtonStyle}
                    onClick={() => setOpen(false)}
                    ref={cancelButtonRef}
                >
                    Cancel
                </Button>
                <Button
                    activeStyle={t.deleteButtonStyle}
                    disabled={loading || disabled || blocked.length > 0}
                    onClick={runDelete}
                >
                    Delet{loading ? 'ing...' : 'e'}
                </Button>
            </div>
        </Modal>
    )

}
