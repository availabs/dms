import React from "react"

import get from "lodash/get"

const Init = props => ({
  topLeft: get(props, "startPos", [500, 500]),
  dragPos: [0, 0],
  dragging: false
})
const Reducer = (state, action) => {
  const { type, ...payload } = action;
  switch (type) {
    case "drag-start":
      return {
        ...state,
        dragPos: [...payload.pos],
        dragging: true
      }
    case "drag-move": {
      const { topLeft: [l, t], dragPos: [x1, y1] } = state;
      const { pos: [x2, y2] } = payload;
      return {
        ...state,
        dragPos: [x2, y2],
        topLeft: [l + (x2 - x1), t + (y2 - y1)]
      };
    }
    case "drag-stop":
      return {
        ...state,
        topLeft: [...payload.pos],
        dragging: false
      }
    default:
      return state;
  }
}

const Draggable = ({ padding = "1rem", dragHandle = null, children, ...props }) => {
  const [state, dispatch] = React.useReducer(Reducer, props, Init);

  const dragMove = React.useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    dispatch({
      type: "drag-move",
      pos: [e.clientX, e.clientY]
    });
  }, []);

  React.useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", dragMove);
    }
  }, [dragMove]);

  const [ref, setRef] = React.useState(null);

  const comp = React.useMemo(() => {
    if (!ref) return null;
    if (typeof dragHandle === "string") {
      return document.getElementById(dragHandle) || ref;
    }
    return ref;
  }, [dragHandle, ref]);

  const dragStart = React.useCallback(e => {
    if (!ref) return;
    const dragStop = e => {
      window.removeEventListener("mousemove", dragMove);
      const rect = ref.getBoundingClientRect(ref);
      dispatch({
        type: "drag-stop",
        pos: [rect.x, rect.y]
      });
    }
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("mouseup", dragStop, { once: true });
    dispatch({
      type: "drag-start",
      pos: [e.clientX, e.clientY]
    });
  }, [dragMove, ref]);

  React.useEffect(() => {
    if (!comp) return;
    comp.addEventListener("mousedown", dragStart);
    return () => {
      comp.removeEventListener("mousedown", dragStart);
    }
  }, [dragStart, comp]);

  React.useEffect(() => {
    if (!comp) return;
    if (!state.dragging) {
      comp.classList.add("cursor-grab");
      comp.classList.remove("cursor-grabbing");
    }
    else {
      comp.classList.remove("cursor-grab");
      comp.classList.add("cursor-grabbing");
    }
  }, [comp, state.dragging]);

  return (
    <div
      className={ `
        fixed inset-0 z-50
        ${ state.dragging ? "pointer-events-auto" : "pointer-events-none" }
      ` }
    >
      <div ref={ setRef }
        className={ `
          fixed inline-block left-0 top-0 z-10 pointer-events-auto
        ` }
        style={ {
          transform: `
            translate(
              MIN(CALC(${ window.innerWidth }px - 100% - ${ padding }), MAX(${ padding }, ${ state.topLeft[0] }px)),
              MIN(CALC(${ window.innerHeight }px - 100% - ${ padding }), MAX(${ padding }, ${ state.topLeft[1] }px))
            )
          `
        } }
      >
        { children }
      </div>
    </div>
  )
}
export default Draggable;
