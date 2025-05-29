import React, { useContext } from "react"
import defaultTheme from "./defaultTheme.json"

export const ThemeContext = React.createContext(defaultTheme);

const useTheme = () => useContext(ThemeContext);
export default useTheme;


