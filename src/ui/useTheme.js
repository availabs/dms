import React from "react"
import defaultTheme from "./defaultTheme"
import { registerLayoutWidget } from './components/Layout'
import { get, set, merge, cloneDeep } from 'lodash-es'

export const RegisterLayoutWidget = (name,widget) => registerLayoutWidget(name,widget)
export const ThemeContext = React.createContext(defaultTheme);

export const getPatternTheme = (themes, pattern) => {
  let patternSelection = (
    pattern?.theme?.selectedTheme || //current Theme Setting
    pattern?.theme?.settings?.theme?.theme || //old Theme setting pre v0.
    'default'
  )
  //console.log('useTheme - getPtternTheme', pattern)
  let baseTheme = merge(
		cloneDeep(defaultTheme),
    cloneDeep(themes?.[patternSelection] || {}),
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
  const finalActiveStyle = activeStyle || activeStyle === 0 ?  activeStyle : componentTheme.options?.activeStyle || 0
  return componentTheme?.styles ?
    componentTheme.styles[finalActiveStyle] :
    componentTheme || {}
}
