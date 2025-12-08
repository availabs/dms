import React from 'react'
import { Field, Fieldset, Label, Description } from '@headlessui/react'
import Select from './Select'
import Listbox from './Listbox'
import List from './List'
import Switch from './Switch'
import Button from './Button'
import Input, { ConfirmInput, Textarea } from './Input'

import {ThemeContext} from '../useTheme';

const Spacer = ({ children, ...props }) => <div >{children}</div>;

const componentRegistry = {
    Input,
    ConfirmInput,
    Textarea,
    Select,
    List,
    Listbox,
    Switch,
    Button,
    Spacer
}

export const fieldTheme = {
  field: 'pb-2',
  label: 'select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/6 dark:text-white',
  description: 'text-base/6 text-zinc-500 data-[disabled]:opacity-50 sm:text-sm/6 dark:text-zinc-400'
}


export default function FieldSetComp ({ components, className }) {
  return (
    <Fieldset className={className}>
      {
        components.map((c,i) => {
          let Comp = typeof c.type === 'function' ? c.type : (componentRegistry[c.type] || Input);
          // let Comp = typeof c.type === 'string' ? (componentRegistry[c.type] || Input) : c.type;

          return (
            <FieldComp key={i} {...c}>
              <Comp {...c} type={c.input_type} />
            </FieldComp>
          )
        })
      }
    </Fieldset>
  )
}

export const docs = {
  themeKey: 'field',
  components: [
    {label: 'field 1', description: 'this is field 1.'},
    {label: 'field 2', description: 'this is field 2.'},
  ]
}
export function FieldComp  ({ label, description, children, customTheme}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {
      ...themeFromContext,
      field: {
          ...fieldTheme,
          ...(themeFromContext.field || {}),
          ...customTheme
      }
  };
  return (
    <Field className={theme.field.field}>
      {label && <Label className={theme?.field?.label}>{label}</Label>}
      {description && <Description className={theme?.field?.description}>{description}</Description>}
      {children}
    </Field>
  )
}
