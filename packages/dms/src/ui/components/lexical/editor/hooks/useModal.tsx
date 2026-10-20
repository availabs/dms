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
// used when the host ThemeContext has no `UI` (2026-10-17: the primitives don't import the editor, so no import
// cycle — this replaced a raw-HTML fallback shell)
import DefaultModal from '../../../Modal';
import DefaultButton from '../../../Button';

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
  const Modal = UI?.Modal || DefaultModal;
  const Button = UI?.Button || DefaultButton;
  const m = getComponentTheme(full, 'modal') as
    | { header?: string; title?: string; closeButtonStyle?: string; body?: string }
    | undefined;

  return (
    <Modal open={open} setOpen={(v: boolean) => { if (!v) onClose(); }}>
      <div className={m?.header || 'flex items-center justify-between mb-3 pb-2 border-b border-gray-200'}>
        <h2 className={m?.title || 'text-lg font-medium'}>{title}</h2>
        {/* a UI.Button named style (2026-10-17, raw-HTML pass): 'lexModalClose' (the old fallback literal) unless the
            theme's own modal.closeButton was lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles) */}
        <Button activeStyle={m?.closeButtonStyle || 'lexModalClose'} onClick={onClose} aria-label="Close">
          ✕
        </Button>
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
