import React from 'react'
import { Field, Fieldset, Label, Description } from '@headlessui/react'
import Select from '../select/'
import Input, {ConfirmInput} from '../input'

import { CMSContext } from '../../../siteConfig';


const componentRegistry= {
  Input,
  ConfirmInput,
  Select
}

export const fieldTheme = {
  field: 'pb-2',
  label: 'select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/6 dark:text-white',
  description: 'text-base/6 text-zinc-500 data-[disabled]:opacity-50 sm:text-sm/6 dark:text-zinc-400'
}


export default function FieldSetComp ({ components }) {
  const { theme = { ield: fieldTheme } } = React.useContext(CMSContext) || {}
  return (
    <Fieldset>
      {
        components.map((c,i) => {
          let Comp = componentRegistry[c.type] || Input
          return (
            <FieldComp key={i} {...c}>
              <Comp {...c} />
            </FieldComp>
          )
        })
      }
    </Fieldset>
  )
}

export function FieldComp  ({ label, description, children}) {
  const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  return (
    <Field className={theme.field.field}>
      {label && <Label className={theme?.field?.label}>{label}</Label>}
      {description && <Description className={theme?.field?.description}>{description}</Description>}
      {children}
    </Field>
  )
}


