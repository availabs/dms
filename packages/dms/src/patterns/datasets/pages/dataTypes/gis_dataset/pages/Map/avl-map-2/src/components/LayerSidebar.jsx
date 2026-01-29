import React from "react"

import get from "lodash/get"

import "./animations.css"

import { MultiLevelSelect } from "../uicomponents"

import { useComponentLibrary } from "./StyledComponents"
import { useTheme } from "../uicomponents"

import LayersPanel from "./LayersPanel"
import LegendPanel from "./LegendPanel"
import StylesPanel from "./StylesPanel"

const DefaultPanelSettings = {
  LayersPanel: {
    icon: "fa-solid fa-layer-group",
    Panel: LayersPanel
  },
  StylesPanel: {
    icon: "fa-solid fa-palette",
    Panel: StylesPanel
  },
  LegendPanel: {
    icon: "fa-sharp fa-solid fa-chart-simple",
    Panel: LegendPanel
  }
};

const LayerSidebar = ({ startOpen = true, Panels = [], ...props }) => {

  const [ref, setRef] = React.useState(null);
  const [width, setWidth] = React.useState("fit-content");

  React.useEffect(() => {
    if (!ref) return;
    const { width } = ref.getBoundingClientRect();
    setWidth(`${ width }px`);
  }, [ref]);

  const [open, setOpen] = React.useState(startOpen);
  const toggle = React.useCallback(() => {
    setOpen(o => !o);
  }, []);

  const [tabIndex, setTabIndex] = React.useState(0);

  const SidebarPanels = React.useMemo(() => {
    return Panels.reduce((a, c) => {
      if ((typeof c === "string") && (c in DefaultPanelSettings)) {
        a.push(DefaultPanelSettings[c]);
      }
      else if ((typeof c.Panel === "function") && (typeof c.icon === "string")) {
        a.push(c);
      }
      return a;
    }, [])
  }, [Panels]);

  const {
    LayerSidebarContainer,
    LayerSidebarPanelContainer,
    LayerSidebarTab,
    LayerSidebarToggle
  } = useComponentLibrary();

  return (
    <div className="h-full w-full relative">
      <div className="h-full w-full relative">
        <LayerSidebarContainer open={ open }>

          <div className={ `flex relative` }>
            <div className={ `flex flex-1 ${ open ? "overflow-visible" : "overflow-hidden" }` }
              style={ {
                width: open ? width : "0px",
                transition: "width 150ms",
                animation: open ? "open 150ms" : null
              } }
            >
              { SidebarPanels.map(({ icon }, i) => (
                  <LayerSidebarTab key={ i } icon={ icon }
                    active={ tabIndex === i }
                    setTabIndex={ setTabIndex }
                    index={ i }/>
                ))
              }
            </div>
            <LayerSidebarToggle open={ open }
              toggle={ toggle }/>
          </div>


          <div className={ `
              absolute top-8 bottom-0
              ${ open ? "overflow-visible" : "overflow-hidden" }
            ` }
            style={ {
              width: open ? width : "0px",
              transition: "width 150ms",
              animation: open ? "open 150ms" : null
            } }
          >

            <div ref={ setRef } className="w-fit h-full">
              <LayerSidebarPanelContainer>
                { SidebarPanels.map(({ Panel }, i) => (
                    <div key={ i }
                      className={
                        tabIndex === i ? "block h-full" : "h-0 overflow-hidden invisible"
                      }
                    >
                      <Panel key={ i } { ...props }/>
                    </div>
                  ))
                }
              </LayerSidebarPanelContainer>
            </div>

          </div>

        </LayerSidebarContainer>
      </div>
    </div>
  )
}
export default LayerSidebar;
