import React from "react"
import defaultTheme from "./defaultTheme"
import { registerLayoutWidget } from './components/Layout'
import { get, set, merge, cloneDeep } from 'lodash-es'

export const RegisterLayoutWidget = (name,widget) => registerLayoutWidget(name,widget)
export const ThemeContext = React.createContext(defaultTheme);

export const getPatternTheme = (themes, pattern) => {
  let baseTheme = merge(
		cloneDeep(defaultTheme),
    cloneDeep(themes?.[pattern?.theme?.selectedTheme ||'default'] || {}),
	)
  if(!pattern?.theme?.layout?.options) {
    set(pattern, 'theme.layout.options', cloneDeep(baseTheme?.layout?.options))
  }
  delete  baseTheme?.layout?.options
  return merge(
    baseTheme,
    cloneDeep(pattern.theme)
  );
}

export const getComponentTheme = (theme, compType, activeStyle) => {
  const componentTheme = get(theme, compType, {})
  return componentTheme?.styles ?
    componentTheme.styles[activeStyle || componentTheme.options?.activeStyle || 0] :
    componentTheme || {}
}
