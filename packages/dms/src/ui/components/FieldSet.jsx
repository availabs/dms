import React from 'react'
import List from './List'
import Switch from './Switch'
import Button from './Button'
import Input, { ConfirmInput, Textarea } from './Input'
import { MultiSelectEdit } from './MultiSelect'

import {ThemeContext, getComponentTheme} from '../useTheme';
import {fieldTheme} from './FieldSet.theme';

const Spacer = ({ children, ...props }) => <div >{children}</div>;

const componentRegistry = {
    Input,
    ConfirmInput,
    Textarea,
    List,
    MultiSelect: MultiSelectEdit,
    Switch,
    Button,
    Spacer
}

export default function FieldSetComp ({ components, className, activeStyle }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
    const theme = getComponentTheme(themeFromContext, 'field', activeStyle);

  return (
    <fieldset className={className || theme.fieldWrapper}>
      {
        components.map((c,i) => {
          let Comp = typeof c.type === 'function' ? c.type : (componentRegistry[c.type] || Input);

          return (
            <FieldComp key={i} {...c} activeStyle={activeStyle}>
              <Comp {...c} type={c.input_type} />
            </FieldComp>
          )
        })
      }
    </fieldset>
  )
}

export function FieldComp  ({ label, description, children, customTheme, activeStyle}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext);
  const theme = {
      ...getComponentTheme(themeFromContext, 'field', activeStyle),
      ...customTheme
  }
  // Generate an id so the <label htmlFor> still focuses the input on click —
  // the one behavior Headless's <Field> auto-wired that's worth preserving.
  // We thread it onto the first valid-element child via cloneElement; the
  // component then spreads it to its underlying <input>/<textarea>.
  const inputId = React.useId();
  let injected = false;
  const enhancedChildren = React.Children.map(children, child => {
    if (!injected && React.isValidElement(child) && !child.props.id) {
      injected = true;
      return React.cloneElement(child, { id: inputId });
    }
    return child;
  });

  return (
    <div className={theme.field}>
      {label && <label htmlFor={inputId} className={theme?.label}>{label}</label>}
      {description && <p className={theme?.description}>{description}</p>}
      {enhancedChildren}
    </div>
  )
}
