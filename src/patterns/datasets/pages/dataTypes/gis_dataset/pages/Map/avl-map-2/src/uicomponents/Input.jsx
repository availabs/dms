import React from "react"

import { useTheme } from "./theme"

export const Input = React.forwardRef(({ onChange, className = "input", ...props }, ref) => {
  const doOnChange = React.useCallback(e => {
    onChange(e.target.value, e);
  }, [onChange]);
  const theme = useTheme();
  return (
    <input ref={ ref } { ...props } onChange={ doOnChange }
      className={ theme[className] }/>
  )
})
