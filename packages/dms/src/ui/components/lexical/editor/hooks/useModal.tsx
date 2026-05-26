/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * --- DMS edit ---
 * Originally rendered into a lexical-internal `Modal` with hardcoded
 * grey/white chrome. Refactored to render through the brand's
 * `UI.Modal` from `ThemeContext` so every lexical plugin dialog
 * (Image / Table / Layout / Button / etc.) inherits the active
 * theme's modal skin (panel surface, backdrop opacity, border,
 * shadow) in one move.
 *
 * The dialog *header* (title + close button) reads optional theme keys
 * `modal.header`, `modal.title`, `modal.closeButton`, `modal.body` so a
 * brand that defines those (Tessera does) gets a fully-themed dialog;
 * a theme that only ships the minimum `modal.panel` still renders a
 * usable header with sensible fallback classes.
 */

import {useCallback, useMemo, useState} from 'react';
import * as React from 'react';

import { ThemeContext, getComponentTheme } from '../../../../useTheme';

function ModalShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}): JSX.Element | null {
  const { theme: full = {}, UI } = React.useContext(ThemeContext) || {};
  const Modal = UI?.Modal;
  const m = getComponentTheme(full, 'modal') as
    | { header?: string; title?: string; closeButton?: string; body?: string }
    | undefined;

  // Fallback path: no UI in context (shouldn't happen in normal use,
  // but the editor can be embedded outside ThemeContext in tests).
  if (!Modal) {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-30"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-white p-6 max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b">
            <h2 className="font-medium text-lg">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="cursor-pointer">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    );
  }

  return (
    <Modal open={open} setOpen={(v: boolean) => { if (!v) onClose(); }}>
      <div className={m?.header || 'flex items-center justify-between mb-3 pb-2 border-b border-gray-200'}>
        <h2 className={m?.title || 'text-lg font-medium'}>{title}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className={m?.closeButton || 'cursor-pointer text-sm hover:opacity-70'}
          type="button"
        >
          ✕
        </button>
      </div>
      <div className={m?.body || ''}>{children}</div>
    </Modal>
  );
}

export default function useModal(): [
  JSX.Element | null,
  (title: string, showModal: (onClose: () => void) => JSX.Element) => void,
] {
  const [modalContent, setModalContent] = useState<null | {
    closeOnClickOutside: boolean;
    content: JSX.Element;
    title: string;
  }>(null);

  const onClose = useCallback(() => {
    setModalContent(null);
  }, []);

  const modal = useMemo(() => {
    if (modalContent === null) {
      return null;
    }
    return (
      <ModalShell
        open={true}
        onClose={onClose}
        title={modalContent.title}
      >
        {modalContent.content}
      </ModalShell>
    );
  }, [modalContent, onClose]);

  const showModal = useCallback(
    (
      title: string,
      // eslint-disable-next-line no-shadow
      getContent: (onClose: () => void) => JSX.Element,
      closeOnClickOutside = false,
    ) => {
      setModalContent({
        closeOnClickOutside,
        content: getContent(onClose),
        title,
      });
    },
    [onClose],
  );

  return [modal, showModal];
}
