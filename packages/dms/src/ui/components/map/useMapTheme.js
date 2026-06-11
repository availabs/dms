import { useContext } from "react";

import { ThemeContext, getComponentTheme } from "../../useTheme";
import { mapTheme as defaultMapTheme } from "./map.theme";

export default function useMapTheme(activeStyle) {
  const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const defaultStyle = getComponentTheme({ map: defaultMapTheme }, "map", activeStyle) || {};
  const themedMap = getComponentTheme(themeFromContext, "map", activeStyle) || {};

  return {
    ...defaultStyle,
    ...themedMap,
    legend: {
      ...(defaultStyle.legend || {}),
      ...(themedMap.legend || {}),
    },
    popup: {
      ...(defaultStyle.popup || {}),
      ...(themedMap.popup || {}),
    },
    hover: {
      ...(defaultStyle.hover || {}),
      ...(themedMap.hover || {}),
    },
  };
}
