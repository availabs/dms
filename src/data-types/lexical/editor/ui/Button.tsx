/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// import './Button.css';

import * as React from 'react';
import {ReactNode} from 'react';

import joinClasses from '../utils/joinClasses';

export default function Button({
  'data-test-id': dataTestId,
  children,
  className,
  onClick,
  disabled,
  small,
  title,
}: {
  'data-test-id'?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  small?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      disabled={disabled}
      className={joinClasses(
        'pt-[10px] pb-[10px] pl-[15px] pr-[15px] border-[0px] bg-[#eee] rounded-[5px] cursor-pointer text-[14px] hover:bg-[#ddd]',
        disabled && 'cursor-not-allowed hover:bg-[#eee]',
        small && 'pt-[5px] pb-[5px] pl-[10px] pr-[10px] text-[13px]',
        className,
      )}
      onClick={onClick}
      title={title}
      aria-label={title}
      {...(dataTestId && {'data-test-id': dataTestId})}>
      {children}
    </button>
  );
}
