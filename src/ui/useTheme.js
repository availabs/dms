import React from "react"
import defaultTheme from "./defaultTheme"
import { registerLayoutWidget } from './components/Layout'

export const RegisterLayoutWidget = (name,widget) => registerLayoutWidget(name,widget)
export const ThemeContext = React.createContext(defaultTheme);

export const getComponentTheme = (theme, compType, activeStyle) => {
  return theme[compType]?.styles ?
    theme[compType].styles[activeStyle || theme?.[compType]?.options?.activeStyle || 0] :
    theme[compType] || {}
}
