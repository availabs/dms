import React from "react"

import { useTheme } from "../../uicomponents"

export const ModalContainer = ({ children }) => {
  const theme = useTheme();
  return (
    <div className={ `p-1 rounded ${ theme.bg } w-fit` }>
      <div className={ `border ${ theme.border } rounded whitespace-nowrap` }>
        { children }
      </div>
    </div>
  )
}

export const ModalHeaderContainer = ({ children, closeModal, dragHandle, bringModalToFront }) => {
  const theme = useTheme();
  return (
    <div id={ dragHandle }
      onClick={ bringModalToFront }
      className={ `
        p-1 font-bold ${ theme.bgAccent2 } rounded-t flex
        border-b ${ theme.border } cursor-grabbing
      ` }
    >
      <div className="flex-1">
        { children }
      </div>
      <div>
        <span onClick={ closeModal }
          className="px-2 py-1 hover:bg-gray-400 rounded cursor-pointer"
        >
          <span className="fa fa-close"/>
        </span>
      </div>
    </div>
  )
}

export const ModalContentContainer = ({ children }) => {
  return (
    <div className="p-1">
      { children }
    </div>
  )
}
