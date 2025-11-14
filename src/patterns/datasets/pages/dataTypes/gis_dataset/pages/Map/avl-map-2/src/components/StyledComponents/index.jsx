import React from "react"

import { HoverComponentContainer } from "./HoverComponentContainer"

import {
  LayerSidebarContainer,
  LayerSidebarToggle,
  LayerSidebarTab,
  LayerSidebarPanelContainer,
  LayerPanelContainer,
  LayerPanelHeaderButton,
  LayerPanelHeaderContainer,
  LayerPanelFilterContainer,
  MapStylePanel,
} from "./LayerSidebarComponents"

import {
  InfoBoxContainer,
  InfoBoxHeaderContainer,
  LegendContainer,
  InfoBoxSidebarContainer,
  InfoBoxContentContainer,
} from "./InfoBoxSidebarComponents"

import { LoadingIndicator } from "./LoadingIndicator"

import {
  ModalContainer,
  ModalHeaderContainer,
  ModalContentContainer,
} from "./ModalComponents"

const DefaultComponents = {
  HoverComponentContainer,

  LoadingIndicator,

  LayerSidebarContainer,
  LayerSidebarToggle,
  LayerSidebarTab,
  LayerSidebarPanelContainer,

  LayerPanelContainer,
  LayerPanelHeaderButton,
  LayerPanelHeaderContainer,
  LayerPanelFilterContainer,

  MapStylePanel,

  ModalContainer,
  ModalHeaderContainer,
  ModalContentContainer,

  InfoBoxContainer,
  InfoBoxHeaderContainer,
  LegendContainer,
  InfoBoxSidebarContainer,
  InfoBoxContentContainer,
}

const ComponentContext = React.createContext(DefaultComponents);
export const useComponentLibrary = () => React.useContext(ComponentContext);

export const ComponentLibrary = ({ components = {}, children }) => {
  const Library = React.useMemo(() => {
    return { ...DefaultComponents, ...components };
  }, [components]);
  return (
    <ComponentContext.Provider value={ Library }>
      { children }
    </ComponentContext.Provider>
  )
}
