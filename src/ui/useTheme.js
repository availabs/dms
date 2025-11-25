import React from "react"
import defaultTheme from "./defaultTheme"
import { registerLayoutWidget } from './components/Layout'
import { get } from 'lodash-es'

export const RegisterLayoutWidget = (name,widget) => registerLayoutWidget(name,widget)
export const ThemeContext = React.createContext(defaultTheme);

export const getComponentTheme = (theme, compType, activeStyle) => {
  const componentTheme = get(theme, compType, {})
  return componentTheme?.styles ?
    componentTheme.styles[activeStyle || componentTheme.options?.activeStyle || 0] :
    componentTheme || {}
}
