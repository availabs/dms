import React from "react"

import get from "lodash/get"

import { useComponentLibrary } from "./StyledComponents"

import {
  Legend,
  useTheme
} from "../uicomponents"

const InfoBoxController = ({ Component, Header, startOpen = true, ...props }) => {

  const [open, setOpen] = React.useState(startOpen);
  const toggleOpen = React.useCallback(() => {
    setOpen(prev => !prev);
  }, []);

  const {
    InfoBoxContainer,
    InfoBoxHeaderContainer,
    InfoBoxContentContainer
  } = useComponentLibrary();

  return (
      <InfoBoxContainer { ...props }>
        { !Header ? null :
          <InfoBoxHeaderContainer open={ open } toggleOpen={ toggleOpen }>
            { typeof Header === "function" ? <Header { ...props }/> : Header }
          </InfoBoxHeaderContainer>
        }
        <div className={ open ? "block" : "h-0 overflow-hidden invisible"}>
          <InfoBoxContentContainer>
            <Component { ...props }/>
          </InfoBoxContentContainer>
        </div>
      </InfoBoxContainer>
  )
}

const InfoBoxSidebar = allProps => {
  const {
    activeLayers,
    legend,
    ...props
  } = allProps;

  const LayersWithInfoBoxes = React.useMemo(() => {
    return activeLayers.reduce((a, c) => {
      if (get(c, ["infoBoxes", "length"], 0)) {
        a.push(c);
      }
      return a;
    }, [])
  }, [activeLayers]);

  const {
    InfoBoxSidebarContainer,
    LegendContainer
  } = useComponentLibrary();

  const infoBoxFilter = React.useCallback(({ isActive = true }, layer) => {
    if (typeof isActive === "function") {
      return isActive({ ...allProps, layer });
    }
    return Boolean(isActive);
  }, [allProps]);

  return (
    <InfoBoxSidebarContainer>
      { !legend.isActive ? null :
        <LegendContainer { ...legend }>
          <Legend { ...legend }/>
        </LegendContainer>
      }
      { !LayersWithInfoBoxes.length ? null :
        <div className={ `${ legend.isActive ? "px-1 pb-1" : "p-1" } grid grid-cols-1 gap-1` }>
          { LayersWithInfoBoxes.reduce((a, c) => {
              a.push(
                ...c.infoBoxes
                  .filter(ib => infoBoxFilter(ib, c))
                  .map((options, i) => (
                    <InfoBoxController key={ `${ c.id }-${ i }` }
                      { ...props } { ...options } legend={ legend } layer={ c }/>
                  ))
              )
              return a;
            }, [])
          }
        </div>
      }
    </InfoBoxSidebarContainer>
  )
}
export default InfoBoxSidebar;
