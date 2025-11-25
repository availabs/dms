import React from "react"

import { useTheme } from "../uicomponents"
import { useComponentLibrary } from "./StyledComponents"

const getTranslate = (pos, width, height) => {

  const gap = 30, padding = 10, { x, y } = pos;

  const yMax = height,
    yTrans = `max(
      ${ padding }px,
      min(calc(${ y }px - 50%), calc(${ yMax - padding }px - 100%))
    )`;
  if (x < width * 0.5) {
    return `translate(
      ${ x + gap }px,
      ${ yTrans }
    )`
  }
  return `translate(
    calc(-100% + ${ x - gap }px),
    ${ yTrans }
  )`
}

const getPinnedTranslate = ({ x, y }, orientation) => {

  const gap = 30;

  const yTrans = `calc(${ y }px - 50%)`;

  if (orientation === "right") {
    return `translate(
      ${ x + gap }px,
      ${ yTrans }
    )`
  }
  return `translate(
    calc(-100% + ${ x - gap }px),
    ${ yTrans }
  )`
}
const getTransformOld = ({ x }, orientation) => {
  if (orientation === "right") {
    return "translate(-50%, -50%) rotate(45deg) skew(-15deg, -15deg)"
  }
  return "translate(50%, -50%) rotate(45deg) skew(-15deg, -15deg)"
}
const getTransform = ({ x, y }, height, orientation) => {
  if (orientation === "left") {
    return `translate(calc(${ x }px - 175%), max(50%, min(calc(${ height }px - 150%), calc(${ y }px - 50%)))) rotate(45deg) skew(-15deg, -15deg)`
  }
  return `translate(calc(${ x }px + 75%), max(50%, min(calc(${ height }px - 150%), calc(${ y }px - 50%)))) rotate(45deg) skew(-15deg, -15deg)`
}

const RemoveButton = ({ orientation, onClick, children }) => {
  const theme = useTheme();
  return (
    <div onClick={ onClick }
      style={ {
        zIndex: 1,
        transform: orientation === "left" ?
          "translate(-0.75rem, -0.75rem)" : "translate(0.75rem, -0.75rem)"
      } }
      className={ `
        rounded absolute inline-block top-0
        ${ theme.bg } ${ theme.textHighlightHover } cursor-pointer
        ${ orientation === "left" ? "left-0" : "right-0" }
      ` }
    >
      <div className="w-6 h-6 flex items-center justify-center">
        <span className="fa fa-close"/>
      </div>
    </div>
  )
}

export const PinnedHoverComponent = ({ children, remove, id, lngLat, project, width, height }) => {

  const pos = project(lngLat);

  const orientation = React.useMemo(() => {
    return pos.x < width * 0.5 ? "right" : "left";
  }, [pos, width]);

  const pointerStyle = React.useMemo(() => {
    return {
      transform: getTransform(pos, height, orientation)
    };
  }, [pos, orientation]);

  const doRemove = React.useCallback(e => {
    remove(id);
  }, [remove, id]);

  const theme = useTheme();

  const { HoverComponentContainer } = useComponentLibrary();

  return (
    <>
      <div
        className={ `
          absolute top-0 left-0 z-20
          pointer-events-auto
        ` }
        style={ {
          transform: getTranslate(pos, width, height)
        } }
      >
        <HoverComponentContainer>
          { children }
        </HoverComponentContainer>

        <RemoveButton orientation={ orientation }
          onClick={ doRemove }/>

      </div>
      <div style={ pointerStyle }
        className={ `
          absolute w-6 h-6 rounded-bl rounded-tr ${ theme.bg } top-0 left-0 z-10
        ` }/>
    </>
  )
}

export const HoverComponent = ({ children, lngLat, project, width, height }) => {
  const { HoverComponentContainer } = useComponentLibrary();
  return (
    <div className={ `
        absolute top-0 left-0 z-20
        pointer-events-none
      ` }
      style={ {
        transform: getTranslate(project(lngLat), width, height),
        transition: "transform 0.05s ease-out"
      } }
    >
      <HoverComponentContainer>
        { children }
      </HoverComponentContainer>
    </div>
  )
}
