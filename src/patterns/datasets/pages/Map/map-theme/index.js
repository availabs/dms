
import {
  composeTheme,
  makeProxy,
  $compositions
} from "~/modules/avl-map-2/src"

const MapThemeBase = {
  bgInput: "bg-white",
  bgInputHover: "hover:bg-white",

  bgContrast: "bg-gray-800",
  bgContrastHover: "hover:bg-gray-800",

  textContrast: "text-white",
  textContrastHover: "hover:text-white",

  text: "text-gray-800 disabled:text-gray-400 placeholder:text-gray-400",
  textDisabled: "text-gray-400 disabled:text-gray-400 placeholder:text-gray-400",
  bg: "bg-white",
  border: "border-gray-800",
  outline: "outline-gray-800",

  textButton: "text-gray-400 disabled:text-gray-400 placeholder:text-gray-400",
  bgButton: "bg-gray-400",
  bgButtonHover: "hover:bg-gray-400",
  borderButton: "shadow",
  outlineButton: "outline-gray-400",

  textInfo: "text-teal-400 disabled:text-teal-400 placeholder:text-teal-400",
  bgInfo: "bg-teal-400",
  bgInfoHover: "hover:bg-teal-400",
  borderInfo: "border-teal-400",
  outlineInfo: "outline-teal-400",

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

  bgAccent1: "bg-white",
  bgAccent2: "bg-white",
  bgAccent3: "bg-white",
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

const composed = composeTheme(MapThemeBase);
const MapTheme = makeProxy(composed);

export default MapTheme;
