import React from "react"

import throttle from "lodash/throttle"

const getTranslate = ({ pos, svgWidth, svgHeight, margin, position, windowPos }) => {

  const gap = 30, padding = 10, [x, y] = pos, [wx, wy] = windowPos;

  switch (position) {
    case "above": {
      const xMax = svgWidth - margin.right;
      return `translate(
        max(
          min(calc(${ x }px - 50%), calc(${ xMax - padding }px - 75%)),
          calc(${ margin.left + padding }px)
        ),
        calc(-100% - ${ gap - y }px)
      )`;
    }
    default: {
      const yMax = svgHeight - margin.bottom;

      let yTrans = `max(
                        ${ margin.top + padding }px,
                        min(${ y - gap }px, ${ yMax - padding }px )
                      )`;

      if (wy > window.innerHeight * 0.5) {
        yTrans = `calc(-75% + ${ y - padding }px )`;
      }

      if (x < margin.left + (svgWidth - margin.left - margin.right) * 0.5) {
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
  }

}

export const HoverCompContainer = ({ show, children, theme = {}, ...rest }) => {
  // `theme.tooltip` replaces the container's LOOK — background, radius, typography, elevation.
  // Everything else here is STRUCTURE and is emitted in every case:
  //
  //   absolute top-0 left-0 z-50   positions the tooltip against the graph container
  //   pointer-events-none          stops it swallowing the hover that spawned it
  //   whitespace-nowrap            keeps rows on one line (with width:max-content below)
  //   hover-comp                   an ancestor HOOK, not decoration: avl-graph.css styles every
  //                                swatch through `.hover-comp .color-square`, so a token that
  //                                could drop it would break swatches on every site.
  //
  // Unset, the fallback is the historical `rounded bg-inherit`. Note what `bg-inherit` means in
  // practice: background-color is NOT an inherited property, so this forces the value from the
  // parent — which is `.avl-graph-container`, itself `background-color: inherit`, resolving up
  // to GraphComponent's wrapper and its `theme.bgColor`. Core's "Light Mode" sets `bg-white`,
  // but a brand that defines no `bgColor` (transportny) leaves the whole chain transparent, so
  // the tooltip has no background of its own and the chart shows through it. Supplying this
  // token is what gives a tooltip a real, chosen background.
  const look = theme.tooltip;
  return (
    <div
      className={ `
        absolute top-0 left-0 z-50 pointer-events-none
        whitespace-nowrap hover-comp ${ look || "rounded bg-inherit" }
      ` }
      style={ {
        display: show ? "inline-block" : "none",
        // width: max-content — an inline-block shrink-to-fits at min(content, CONTAINING
        // BLOCK), so a tooltip inside a narrow graph (the corridor-view 52px day-avg strip)
        // was capped at the strip's width and clipped its text. max-content sizes to the
        // content regardless of the host graph's width; wide graphs are unchanged.
        width: "max-content",
        transform: getTranslate(rest),
        // The hardcoded drop shadow exists to separate a transparent `bg-inherit` tooltip from
        // the chart behind it. A theme that supplies its own background owns its own elevation
        // (transportny's token carries `shadow-lg`), so it steps aside rather than stacking.
        ...(look ? null : { boxShadow: "2px 2px 8px 0px rgba(0, 0, 0, 0.75)" }),
        transition: "transform 0.15s ease-out"
      } }
    >
      { children }
    </div>
  )
}

const UPDATE_DATA = "update-data"

const Reducer = (state, action) => {
  const { type, ...payload } = action;
  switch (type) {
    case UPDATE_DATA:
      return { ...state, ...payload };
    default:
      return state;
  }
}
const InitialState = {
  show: false,
  pos: [0, 0],
  windowPos: [0, 0],
  data: null,
  target: "graph"
}

export const useHoverComp = ref => {

  const [hoverData, dispatch] = React.useReducer(Reducer, InitialState);
  const updateHoverData = React.useMemo(() => {
    return throttle(dispatch, 25);
  }, [dispatch]);

  const onMouseOver = React.useCallback((e, data, { pos = null, target = "graph" } = {}) => {
    const rect = ref.current.getBoundingClientRect();
    updateHoverData({
      type: UPDATE_DATA,
      show: true,
      target,
      data,
      windowPos: [e.clientX, e.clientY],
      pos: pos ?
        [pos.x - rect.x, pos.y - rect.y] :
        [e.clientX - rect.x, e.clientY - rect.y]
    });
  }, [ref, updateHoverData]);

  const onMouseMove = React.useCallback((e, data, { pos = null, target = "graph" } = {}) => {
    const rect = ref.current.getBoundingClientRect();
    updateHoverData({
      type: UPDATE_DATA,
      show: true,
      target,
      data,
      windowPos: [e.clientX, e.clientY],
      pos: pos ?
        [pos.x - rect.x, pos.y - rect.y] :
        [e.clientX - rect.x, e.clientY - rect.y]
    });
  }, [ref, updateHoverData]);

  const onMouseLeave = React.useCallback(e => {
    updateHoverData({ type: UPDATE_DATA, show: false });
  }, [updateHoverData]);

  return {
    hoverData,
    onMouseOver,
    onMouseMove,
    onMouseLeave
  }
}
