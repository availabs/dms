import React from "react"

import Draggable from "./Draggable"

import { useComponentLibrary } from "./StyledComponents"
import { useTheme } from "../uicomponents"

export const Modal = allProps => {
  const {
    Header = null,
    startPos,
    MapActions,
    layerId,
    modalId,
    children,
    ...props
  } = allProps;

  const dragHandle = React.useMemo(() => {
    return `modal-drag-handle-${ layerId }-${ modalId }`;
  }, [layerId, modalId]);

  const closeModal = React.useCallback(() => {
    MapActions.closeModal(layerId, modalId);
  }, [layerId, modalId, MapActions.closeModal]);

  const bringModalToFront = React.useCallback(() => {
    MapActions.bringModalToFront(layerId, modalId);
  }, [layerId, modalId, MapActions.bringModalToFront]);

  const {
    ModalContainer,
    ModalHeaderContainer,
    ModalContentContainer
  } = useComponentLibrary();

  return (
    <Draggable startPos={ startPos }
      dragHandle={ dragHandle }
    >
      <ModalContainer>
        <ModalHeaderContainer
          closeModal={ closeModal }
          bringModalToFront={ bringModalToFront }
          dragHandle={ dragHandle }
        >
          { typeof Header === "function" ?
            <Header { ...props }
              closeModal={ closeModal }
              bringModalToFront={ bringModalToFront }
              MapActions={ MapActions }
              dragHandle={ dragHandle }/> :
            Header
          }
        </ModalHeaderContainer>
        <ModalContentContainer>
          { children }
        </ModalContentContainer>
      </ModalContainer>
    </Draggable>
  )
}
