import React, { useContext } from "react"

import defaultTheme from "./default-theme"

const ThemeContext = React.createContext(defaultTheme);

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext


