import React from "react"

import { useComponentLibrary } from "./StyledComponents"
import { useTheme } from "../uicomponents"

const StylePanelController = ({ styleIndex, setMapStyle, isActive, children }) => {
  const onClick = React.useCallback(e => {
    setMapStyle(styleIndex);
  }, [styleIndex, setMapStyle]);
  return (
    <div onClick={ isActive ? null : onClick }>
      { children }
    </div>
  )
}

const StylesPanel = ({ mapStyles, styleIndex, MapActions }) => {
  const { MapStylePanel } = useComponentLibrary();
  return (
    <div className="grid grid-cols-1 gap-1">
      <div className="font-bold text-lg text-center">
        Map Style Selector
      </div>
      { mapStyles.map((ms, i) => (
          <StylePanelController key={ i }
            styleIndex={ i }
            setMapStyle={ MapActions.setMapStyle }
            isActive={ i === styleIndex }
          >
            <MapStylePanel mapStyle={ ms }
              isActive={ i === styleIndex }/>
          </StylePanelController>
        ))
      }
    </div>
  )
}
export default StylesPanel;
