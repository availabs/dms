import useMapTheme from "./useMapTheme";

export default function useMapLegendTheme(activeStyle) {
  const mapTheme = useMapTheme(activeStyle);
  return mapTheme.legend || {};
}
