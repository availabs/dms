import React from "react"

import { useTheme } from "../../uicomponents"

export const InfoBoxHeaderContainer = ({ open, toggleOpen, children }) => {
  const theme = useTheme();
  return (
    <div onClick={ toggleOpen }
      className={ `
        p-1 font-bold flex rounded-t cursor-pointer
        ${ theme.bgAccent1 } ${ theme.bgAccent2Hover }
        ${ open ? `border-b ${ theme.border }` : "rounded-b" }
      ` }
    >
      <div className="flex-1">
        { children }
      </div>
      <div>
        <span className="px-2 py-1">
          <span className={ `fa fa-${ open ? "minus" : "plus" }` } />
        </span>
      </div>
    </div>
  )
}

export const InfoBoxContentContainer = ({ children }) => {
  return (
    <div className="p-1">
      { children }
    </div>
  )
}

export const InfoBoxContainer = ({children }) => {
  const theme = useTheme();
  return (
    <div className={ `rounded border ${ theme.border }` }>
      { children }
    </div>
  )
}

export const LegendContainer = ({ name, title, children }) => {
  const theme = useTheme();
  return (
    <div className={ `p-1 sticky top-0 ${ theme.bg }` }>
      <div className={ `
          p-1 relative border rounded pointer-events-auto
          ${ theme.bgLegend } ${ theme.bgLegendHover } ${ theme.border }
        ` }
      >
        <div>{ name || title }</div>
        <div>{ children }</div>
      </div>
    </div>
  )
}

export const InfoBoxSidebarContainer = ({ open, children }) => {
  const theme = useTheme();
  return (
    <div className="relative h-full">
      <div className={ `
          w-96 ${ theme.bg } rounded pointer-events-auto
          max-h-full scrollbar-sm overflow-auto
        ` }
      >
        { children }
      </div>
    </div>
  )
}
