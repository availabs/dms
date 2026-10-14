import React from "react";
import {createPortal} from "react-dom";
import {ThemeContext, getComponentTheme} from "../useTheme";
import { warnLockedClassName } from "../warnLockedClassName";
import {modalTheme} from "./Modal.theme";
import useModalOverlay from "./useModalOverlay";

// Locked 2026-10-14 (ui-control-tabs-overlays.md): the look comes only from theme.modal[activeStyle];
// no className passthrough. Add a named style in Modal.theme.jsx for a new look.
export default function Modal ({open, setOpen, initialFocus, children, activeStyle, className}) {
    warnLockedClassName('Modal', className);
    const close = () => setOpen?.(false);
    useModalOverlay(open, close);

    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = { ...modalTheme.styles[0], ...getComponentTheme(themeFromContext, 'modal', activeStyle) };

    if (!open || typeof document === 'undefined') return null;

    const overlay = (
        <div role="dialog" aria-modal="true" className={theme.overlay}>
            <div className={theme.backdrop} aria-hidden="true" />
            <div className={theme.scroller}>
                <div
                    onClick={close}
                    className={theme.positioner}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className={theme.panel}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
}
