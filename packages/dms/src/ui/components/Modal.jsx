import React from "react";
import {createPortal} from "react-dom";
import {ThemeContext, getComponentTheme} from "../useTheme";
import {modalTheme} from "./Modal.theme";
import useModalOverlay from "./useModalOverlay";

export default function Modal ({open, setOpen, initialFocus, children, className, activeStyle}) {
    const close = () => setOpen?.(false);
    useModalOverlay(open, close);

    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const theme = { ...modalTheme.styles[0], ...getComponentTheme(themeFromContext, 'modal', activeStyle) };

    if (!open || typeof document === 'undefined') return null;

    const overlay = (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-30">
            <div className="fixed inset-0 bg-gray-500/75" aria-hidden="true" />
            <div className="fixed inset-0 z-10 overflow-y-auto">
                <div
                    onClick={close}
                    className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className={`${theme.panel} ${className || ''}`}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(overlay, document.body);
}
