/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// import './Select.css';

import * as React from 'react';

type SelectIntrinsicProps = JSX.IntrinsicElements['select'];
interface SelectProps extends SelectIntrinsicProps {
  label: string;
}

export default function Select({
  children,
  label,
  className,
  ...other
}: SelectProps): JSX.Element {
  return (
    <div className="Input__wrapper">
      <label style={{marginTop: '-1em'}} className="Input__label">
        {label}
      </label>
      <select {...other} className={className || 'min-w-[160px] max-w-[290px] border-[1px] border-[solid] border-[#393939] rounded-[0.25em] px-[0.5em] py-[0.25em] text-[1rem] cursor-pointer leading-[1.4] bg-[linear-gradient(to_bottom,_#ffffff_0%,_#e5e5e5_100%)]'}>
        {children}
      </select>
    </div>
  );
}
