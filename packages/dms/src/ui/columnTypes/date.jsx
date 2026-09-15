import React from 'react'
import { TextEdit, TextView } from './text'
import { toISODateValue } from './date.utils'

export const DateEdit = ({ value, ...rest }) => (
    <TextEdit {...rest} type={'date'} value={toISODateValue(value)} />
)

export const DateView = ({ value, ...rest }) => (
    <TextView {...rest} value={toISODateValue(value)} />
)
