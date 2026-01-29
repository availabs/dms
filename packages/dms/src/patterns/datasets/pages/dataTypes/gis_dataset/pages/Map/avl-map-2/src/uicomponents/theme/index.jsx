export * from "./utils"
export * from "./compositions"

import React from "react"

import { composeTheme, makeProxy } from "./utils"
import { $compositions } from "./compositions"

const LightBase = {
  bgInput: "bg-white",
  bgInputHover: "hover:bg-white",

  bgLegend: "bg-gray-300",
  bgLegendHover: "hover:bg-gray-300",

  bgContrast: "bg-gray-800",
  bgContrastHover: "hover:bg-gray-800",

  textContrast: "text-white",
  textContrastHover: "hover:text-white",

  text: "text-gray-800 disabled:text-gray-400 placeholder:text-gray-400",
  textDisabled: "text-gray-400 disabled:text-gray-400 placeholder:text-gray-400",
  bg: "bg-gray-100",
  border: "border-gray-800",
  outline: "outline-gray-800",

  textButton: "text-gray-400 disabled:text-gray-400 placeholder:text-gray-400",
  bgButton: "bg-gray-400",
  bgButtonHover: "hover:bg-gray-400",
  borderButton: "border-gray-400",
  outlineButton: "outline-gray-400",

  textInfo: "text-blue-400 disabled:text-blue-400 placeholder:text-blue-400",
  bgInfo: "bg-blue-400",
  bgInfoHover: "hover:bg-blue-400",
  borderInfo: "border-blue-400",
  outlineInfo: "outline-blue-400",

  textSuccess: "text-green-400 disabled:text-green-400 placeholder:text-green-400",
  bgSuccess: "bg-green-400",
  bgSuccessHover: "hover:bg-green-400",
  borderSuccess: "border-green-400",
  outlineSuccess: "outline-green-400",

  textPrimary: "text-blue-400 disabled:text-blue-400 placeholder:text-blue-400",
  bgPrimary: "bg-blue-400",
  bgPrimaryHover: "hover:bg-blue-400",
  borderPrimary: "border-blue-400",
  outlinePrimary: "outline-blue-400",

  textDanger: "text-red-400 disabled:text-red-400 placeholder:text-red-400",
  bgDanger: "bg-red-400",
  bgDangerHover: "hover:bg-red-400",
  borderDanger: "border-red-400",
  outlineDanger: "outline-red-400",

  textWarning: "text-yellow-400 disabled:text-yellow-400 placeholder:text-yellow-400",
  bgWarning: "bg-yellow-400",
  bgWarningHover: "hover:bg-yellow-400",
  borderWarning: "border-yellow-400",
  outlineWarning: "outline-yellow-400",

  textSmall: "text-sm",
  textBase: "text-base",
  textLarge: "text-lg",

  paddingSmall: "py-0 px-1",
  paddingBase: "py-1 px-2",
  paddingLarge: "py-2 px-4",

  bgAccent1: "bg-gray-200",
  bgAccent2: "bg-gray-300",
  bgAccent3: "bg-gray-400",
  bgAccent4: "bg-gray-500",

  bgAccent1Hover: "hover:bg-gray-200",
  bgAccent2Hover: "hover:bg-gray-300",
  bgAccent3Hover: "hover:bg-gray-400",
  bgAccent4Hover: "hover:bg-gray-500",

  textHighlight: "text-blue-500",
  textHighlightHover: "hover:text-blue-500",

  borderHighlight: "border-blue-500",
  borderHighlightHover: "hover:border-blue-500",

  bgHighlight: "bg-blue-500",
  bgHighlightHover: "hover:bg-blue-500",

  transition: "transition ease-in-out duration-150",

  $compositions
};

const ComposedLightTheme = composeTheme(LightBase);
export const LightTheme = makeProxy(ComposedLightTheme);

const ThemeContext = React.createContext(LightTheme);
export const useTheme = () => React.useContext(ThemeContext);

export const ThemeProvider = ({ theme, children }) => {
  return (
    <ThemeContext.Provider value={ theme }>
      { children }
    </ThemeContext.Provider>
  )
}
export const ThemeUpdater = ({ themeUpdate, children }) => {
  const theme = useTheme();
  const UpdatedTheme = React.useMemo(() => {
    return { ...theme, ...themeUpdate };
  }, [theme, themeUpdate]);
  return (
    <ThemeContext.Provider value={ UpdatedTheme }>
      { children }
    </ThemeContext.Provider>
  )
}
