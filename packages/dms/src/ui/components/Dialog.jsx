import React from 'react'
import {createPortal} from 'react-dom'
import {ThemeContext} from '../useTheme'
import {dialogTheme} from './Dialog.theme'
import useModalOverlay from './useModalOverlay'

export default function DialogComp({ size = 'lg', open=false, onClose=()=>{}, initialFocus, className, children, ...props }) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = {...themeFromContext, dialog: {...dialogTheme, ...(themeFromContext?.dialog || {})}};
  const panelRef = React.useRef(null);
  useModalOverlay(open, onClose, panelRef, initialFocus);

  if (!open || typeof document === 'undefined') return null;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      className={theme?.dialog?.dialogContainer}
      onClick={onClose}
      {...props}
    >
      <div className={theme?.dialog?.backdrop} aria-hidden="true" />
      <div className={theme?.dialog?.dialogContainer2}>
        <div
          ref={panelRef}
          className={`${className || ''} ${theme?.dialog?.sizes?.[size] || ''} ${theme?.dialog?.dialogPanel}`}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
