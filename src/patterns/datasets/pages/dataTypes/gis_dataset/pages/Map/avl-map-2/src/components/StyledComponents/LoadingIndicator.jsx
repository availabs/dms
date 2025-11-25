import React from "react"

import { useTheme } from "../../uicomponents"

export const LoadingIndicator = ({ layer }) => {
  const theme = useTheme();
  const {
    icon = "fa-solid fa-spinner",
    color = theme.textHighlight
  } = layer.loadingIndicator;
  return (
    <div className={ `w-fit flex items-center rounded-l ${ theme.bg } p-2` }
      style={ {
        borderTopRightRadius: "2rem",
        borderBottomRightRadius: "2rem",
        minWidth: "16rem"
      } }
    >
      <div className="flex-1 font-bold mr-4">
        { layer.name }
      </div>
      <div className="flex items-center" style={ { fontSize: "2rem" } }>
        <span className={ `${ icon } ${ color } fa-spin` }/>
      </div>
    </div>
  )
}
