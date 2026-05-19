import React, {useEffect, useState} from 'react'
import {createPortal} from 'react-dom'
import Icon from './Icon'

export default function Drawer ({ open, setOpen, width='max-w-64', children, closeOnClick=true }) {
  const [slidIn, setSlidIn] = useState(false);
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    setSlidIn(false);
    const t = setTimeout(() => setRender(false), 500);
    return () => clearTimeout(t);
  }, [open]);

  // Once the panel has mounted at translate-x-full, flip slidIn on the next
  // frame so the transition animates. Done in a separate effect from the mount
  // so React commits and paints the start state before the slidIn update lands.
  useEffect(() => {
    if (!(render && open)) return;
    const r = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(r);
  }, [render, open]);

  // Non-modal: no body scroll lock, no full-viewport overlay — the page
  // underneath stays interactive. Escape still closes when allowed.
  useEffect(() => {
    if (!render || !closeOnClick) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen?.(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [render, closeOnClick, setOpen]);

  if (!render || typeof document === 'undefined') return null;

  const overlay = (
    <div
      role="dialog"
      className={`fixed right-0 top-0 bottom-0 ${width} bg-white shadow-lg z-50 transition-transform duration-500 ${slidIn ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="absolute right-2 top-2">
        <button
          type="button"
          className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
          onClick={() => setOpen?.(false)}
        >
          <span className="absolute -inset-2.5" />
          <span className="sr-only">Close panel</span>
          <Icon icon={'XMark'} className="size-6" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );

  return createPortal(overlay, document.body);
}
