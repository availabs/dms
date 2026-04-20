import React from 'react'
import { Button } from '@headlessui/react'
import { ThemeContext, getComponentTheme } from '../useTheme'

// buttonType = type. in some configs, type is reserved for component type, but here to pick theme, they're the same
const themeOptionColors = {
  primary: "bg-blue-500 hover:bg-blue-600 text-white",
  danger: "bg-red-500 hover:bg-red-600 text-white",
  cancel: "bg-gray-300 hover:bg-gray-400 text-gray-800",
  transparent: "bg-transparent hover:bg-gray-100 text-gray-700",
}
const themeOptionSizes = {
  xs: "px-2 py-0.5 text-xs",
  sm: "px-3 py-1 text-sm",
  base: "px-4 py-2 text-sm",
}

export default function ButtonComp ({ children, disabled, onClick=()=>{}, type='default', buttonType, padding, rounded, className, activeStyle, themeOptions,...props}) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const theme = getComponentTheme(themeFromContext,'button', activeStyle)//{...themeFromContext, button: {...buttonTheme, ...(themeFromContext.button || {})}};

  let buttonClass = className || theme?.button;
  if (themeOptions) {
    const { size = "base", color = "primary" } = themeOptions;
    buttonClass = `rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${themeOptionSizes[size] || themeOptionSizes.base} ${themeOptionColors[color] || themeOptionColors.primary} ${className || ""}`;
  }

  return (
    <Button
      disabled={disabled}
      className={buttonClass}
      onClick={onClick}
      {...props}
    >
      {children}
    </Button>
  )
}
