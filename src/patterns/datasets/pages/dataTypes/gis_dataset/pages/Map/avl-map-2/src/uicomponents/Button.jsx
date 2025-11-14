import React from "react"

import { useTheme } from "./theme"

export const Button = ({ className = "button", children, ...props }) => {
  const theme = useTheme();
  return (
    <button className={ theme[className] } { ...props }>
      { children }
    </button>
  )
}
