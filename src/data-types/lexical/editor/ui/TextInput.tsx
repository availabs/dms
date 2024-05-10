/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import InputStyles from './InputStyles';

import * as React from 'react';
import {HTMLInputTypeAttribute} from 'react';

type Props = Readonly<{
  'data-test-id'?: string;
  label: string;
  onChange: (val: string) => void;
  placeholder?: string;
  value: string;
  type?: HTMLInputTypeAttribute;
}>;

export default function TextInput({
  label,
  value,
  onChange,
  placeholder = '',
  'data-test-id': dataTestId,
  type = 'text',
}: Props): JSX.Element {
  return (
    <div className={`${InputStylese["Input__wrapper"]}`}>
      <label className={`${InputStylese["Input__label"]}`}>{label}</label>
      <input
        type={type}
        className={`${InputStylese["Input__input"]}`}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.files)}
        data-test-id={dataTestId}
      />
    </div>
  );
}
