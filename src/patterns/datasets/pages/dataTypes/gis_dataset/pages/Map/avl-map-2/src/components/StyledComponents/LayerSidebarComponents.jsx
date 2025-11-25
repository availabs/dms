import React from "react"

import { useTheme } from "../../uicomponents"

export const LayerSidebarPanelContainer = ({ children }) => {
  const theme = useTheme();
  return (
    <div className={ 
        theme?.LayerSidebarPanelContainer !== 'LayerSidebarPanelContainer' ? 
        theme.LayerSidebarPanelContainer : 
        `w-80 h-full max-h-full p-1 ${ theme.bg } rounded-b pointer-events-auto overflow-auto scrollbar-sm`
      }
    >
      { children }
    </div>
  )
}

export const LayerSidebarContainer = ({ open, children }) => {
  const theme = useTheme();
  
  return (
    <div className={ `
        w-full h-full relative ${ open ? "p-0" : "pr-8" }
      ` }
      style={ { transition: "padding 150ms" } }
    >
      <div className={
        theme?.LayerSidebarContainer !== 'LayerSidebarContainer' ? 
        theme.LayerSidebarContainer : `w-full h-full max-h-full relative` }
      >
        { children }
      </div>
    </div>
  )
}

export const LayerSidebarToggle = ({ toggle, open }) => {
  const theme = useTheme();
  return (
    <div className="pointer-events-auto">
      <div onClick={ toggle }
        className={
          theme?.LayerSidebarToggle != 'LayerSidebarToggle' ? 
          theme.LayerSidebarToggle : `
          h-8 w-8 ${ theme.bg } text-2xl
          flex items-center justify-center
          cursor-pointer ${ open ? "rounded-t" : "rounded" }
          pointer-events-auto absolute
          ${ theme.textHighlightHover }
        ` }
        style={ {
          right: open ? "0rem" : "-2rem",
          transition: "right 150ms"
        } }
      >
        <span className={ `fa fa-caret-${ open ? "left" : "right" }` }/>
      </div>
    </div>
  )
}

export const LayerSidebarTab = ({ icon, active, setTabIndex, index }) => {
  const onClick = React.useCallback(e => {
    setTabIndex(index);
  }, [setTabIndex, index]);
  const theme = useTheme();
  return (
    <div onClick={ onClick }
      className={ 
        active ?
          (theme?.LayerSidebarTabActive != 'LayerSidebarTabActive' ?
          theme?.LayerSidebarTabActive :  
          ` h-8 w-10 rounded-t mr-1 cursor-pointer pointer-events-auto relative ${theme.bg} ${ theme.textHighlight }`
          ) : 
          (theme?.LayerSidebarTab != 'LayerSidebarTab' ?
          theme?.LayerSidebarTab :  
          ` h-8 w-10 rounded-t mr-1 cursor-pointer pointer-events-auto relative ${theme.bgAccent1} ${ theme.textHighlight }`
          )
      }
    >
      { active ?
        <div className="absolute inset-0 flex justify-center items-center">
          <span className={ `${ icon } ` }/>
        </div> :
        <div className="absolute inset-0 flex justify-center items-center">
          <span className={ `${ icon } ` }/>
          <span className={ `
            absolute inset-0 flex justify-center items-center
            opacity:100 hover:opacity-25 ${ theme.text } ${ icon }
          ` }/>
        </div>
      }
    </div>
  )
}

export const LayerPanelContainer = ({ children }) => {
  const theme = useTheme();
  return (
    <div className={ `border ${ theme.border } rounded` }>
      { children }
    </div>
  )
}

export const LayerPanelHeaderButton = ({ children, ...props }) => {
  const theme = useTheme();
  return (
    <span className={ `${ theme.bgAccent3Hover } relative px-2 py-1 rounded cursor-pointer` }
      { ...props }>
      { children }
    </span>
  )
}

export const LayerPanelHeaderContainer = ({ toggleOpen, open, children }) => {
  const theme = useTheme();
  return (
    <div onClick={ toggleOpen }
      className={ `
        p-1 w-full rounded-t ${ open ? "border-b" : "rounded-b" }
        ${ theme.border } ${ theme.bgAccent2 } cursor-pointer
      ` }
    >
      { children }
    </div>
  )
}

export const LayerPanelFilterContainer = ({ name = "Unnamed Filter", lastFilter, children }) => {
  return (
    <div className="flex-1 p-1">
      <div>{ name }</div>
      <div>{ children }</div>
    </div>
  )
}

export const MapStylePanel = ({ mapStyle, isActive }) => {
  const theme = useTheme();
  return (
    <div className={ `
        flex items-center p-1 border ${ theme.border } rounded ${ theme.bgAccent2 }
        ${ isActive ? `border-r-8 ${ theme.borderHighlight }` : `cursor-pointer ${ theme.bgAccent3Hover }` }
      ` }
    >
      <div className="ml-1 flex-1 h-full flex items-center">
        { mapStyle.name }
      </div>
    </div>
  )
}
