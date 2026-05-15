import {useEffect} from 'react';

// Shared overlay plumbing for Dialog / Modal / Drawer / DeleteModal:
// - close on Escape
// - lock body scroll while open
// - cleanup on unmount or close
//
// Deliberately *not* a focus trap. The user has accepted reduced a11y in
// exchange for the perf win of dropping `@headlessui/react`; if a specific
// surface later needs trapped focus (e.g. a destructive-confirm modal),
// wire it locally rather than re-introducing a heavy library.
export default function useModalOverlay(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);
}
