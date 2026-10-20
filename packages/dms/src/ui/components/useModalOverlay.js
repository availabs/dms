import {useEffect, useRef} from 'react';

// Shared overlay plumbing for Dialog / Modal / DeleteModal:
// - close on Escape
// - lock body scroll while open
// - keyboard focus (2026-10-15, owner: "keyboard controls work better" — Tab started on the page behind the
//   modal): on open, focus moves into the panel (`initialFocus` ref, else its first focusable control, else the
//   panel); Tab / Shift+Tab cycle inside it; on close, focus goes back to what opened it. Hand-rolled (a few
//   lines, no library: `@headlessui/react` was dropped for bundle size). Only the topmost open overlay traps.
// - cleanup on unmount or close
//
// `panelRef`: the panel element (the part that holds the controls). Without it only Escape / scroll lock apply.

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
const openPanels = [];   // stack of open panels; the last one owns Tab

const focusables = (panel) => [...panel.querySelectorAll(FOCUSABLE)]
  .filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));

export default function useModalOverlay(open, onClose, panelRef, initialFocus) {
  // callers pass a fresh onClose each render: read the latest from a ref so the effect runs only when `open`
  // changes (re-running it would move focus back to the opener mid-typing)
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const panel = panelRef?.current;
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    if (panel) {
      openPanels.push(panel);
      if (!panel.contains(document.activeElement)) {
        const target = initialFocus?.current || focusables(panel)[0] || panel;
        if (target === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    }
    const handleKey = (e) => {
      const isTop = !panel || openPanels[openPanels.length - 1] === panel;
      if (e.key === 'Escape') { if (isTop) onCloseRef.current?.(); return; }   // stacked: only the top one closes
      if (e.key !== 'Tab' || !panel || !isTop) return;
      const els = focusables(panel);
      if (!els.length) { e.preventDefault(); panel.focus(); return; }
      const first = els[0], last = els[els.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !panel.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      if (panel) {
        const i = openPanels.lastIndexOf(panel);
        if (i >= 0) openPanels.splice(i, 1);
        // back to what opened it, unless focus already went somewhere else on purpose
        if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body || panel.contains(document.activeElement))) {
          opener.focus?.({ preventScroll: true });
        }
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- panelRef / initialFocus are refs
}
