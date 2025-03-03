/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

//import InputStyles from './InputStyles';

import * as React from 'react';


type Props = Readonly<{
  'data-test-id'?: string;
  accept?: string;
  label: string;
  onChange: (files: FileList | null) => void;
}>;
const InputStyles = {}
export default function FileInput({
  accept,
  label,
  onChange,
  'data-test-id': dataTestId,
}: Props): JSX.Element {
  return (
    <div className={`${InputStyles["Input__wrapper"]}`}>
      <label className={`${InputStyles["Input__label"]}`}>{label}</label>
      <input
        type="file"
        accept={accept}
        className={`${InputStyles["Input__input"]}`}
        onChange={(e) => onChange(e.target.files)}
        data-test-id={dataTestId}
      />
    </div>
  );
}
