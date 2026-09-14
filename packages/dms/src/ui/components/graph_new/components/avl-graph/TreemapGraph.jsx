import React from "react"

import * as d3shape from "d3-shape"
import { select as d3select } from "d3-selection"
import {
  hierarchy as d3hierarchy,
  treemap as d3treemap,
  treemapBinary,
  treemapSquarify
} from "d3-hierarchy"

import {
  HoverCompContainer,
  useHoverComp,
  LabelValueHoverComp
} from "./components"

import {
  useSetSize,
  color2rgba
} from "./utils"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject,
  getUniqueId
} from "./utils"

// Sunburst and Treemap draw the same hierarchy tooltip. It lived here as a byte-identical
// copy of the other wrapper's until it was moved to components/HoverComps.jsx. The alias is
// kept so this wrapper's rendered output stays individually pinned by the hover-comp goldens.
export const DefaultTreemapHoverComp = LabelValueHoverComp;

const DefaultHoverCompData = {
  HoverComp: DefaultTreemapHoverComp,
  indexFormat: Identity,
  keyFormat: Identity,
  valueFormat: Identity,
  valueLabel: null,
  showTotals: true,
  position: "side"
}

const InitialState = {
  treemapData: [],
  exiting: [],
  adjustedWidth: 0,
  adjustedHeight: 0
}
const Reducer = (state, action) => {
  const { type, showAnimations, ...payload } = action;
  switch (type) {
  	case "update-state": {
  		return { ...state, ...payload }
  	}
    case "set-data": {
      const { treemapData } = state;
      let prevIds = treemapData.reduce((a, c) => {
        a[c.index] = c;
        return a;
      }, {});
      payload.treemapData.forEach(pie => {
        if (pie.index in prevIds) {
          pie.state = "updating";
          delete prevIds[pie.index];
        }
      })
      if (!showAnimations) {
        prevIds = {};
      }
      return {
        treemapData: [
          ...payload.treemapData,
          ...Object.values(prevIds).map(p => ({ ...p, state: "exiting" }))
        ],
        exiting: Object.keys(prevIds)
      }
    }
    case "exit-data":
      return {
        treemapData: state.treemapData.filter(pie => {
          return payload.exiting.includes(pie.index) ? pie.state !== "exiting" : true;
        }),
        exiting: state.exiting.filter(e => {
          return !payload.exiting.includes(e);
        })
      }
    default:
      return state;
  }
}

const DefaultMargin = {
  left: 10,
  top: 10,
  right: 10,
  bottom: 10
}

const TileMethodMap = {
  "treemapSquarify": treemapSquarify,
  "treemapBinary": treemapBinary
}

export const TreemapGraph = props => {

  const {
    data = EmptyArray,
    margin = EmptyObject,
    hoverComp = EmptyObject,
    // Forwarded to HoverCompContainer for the `tooltip` token. BarGraph already took this;
    // the other five wrappers never destructured it, so the theme stopped here.
    theme = EmptyObject,
    tileMethod = "treemapSquarify",
    indexTextSize = "medium",
    valueTextSize = "medium",
    className ="",
    startAngle = 0,
    endAngle = 2 * Math.PI,
    padAngle = 0,
    colors,
    colorsByKey,
    showAnimations = false,
    highlights = EmptyArray,
    onRectEnter = null,
    onRectLeave = null
  } = props;

// console.log("TreemapGraph::data", data);

  const Margin = React.useMemo(() => {
    return { ...DefaultMargin, ...margin };
  }, [margin]);

  const ref = React.useRef(),
    { width, height } = useSetSize(ref),
    [state, dispatch] = React.useReducer(Reducer, InitialState);

  const exitData = React.useCallback(exiting => {
    dispatch({
      type: "exit-data",
      exiting
    });
  }, []);

  const colorFunc = React.useMemo(() => {
  	return getColorFunc(colors, colorsByKey);
  }, [colors, colorsByKey]);

  const HoverCompData = React.useMemo(() => {
    const hcData = { ...DefaultHoverCompData, ...hoverComp };
    if (typeof hcData.indexFormat === "string") {
      hcData.indexFormat = d3format(hcData.indexFormat);
    }
    if (typeof hcData.keyFormat === "string") {
      hcData.keyFormat = d3format(hcData.keyFormat);
    }
    if (typeof hcData.valueFormat === "string") {
      hcData.valueFormat = d3format(hcData.valueFormat);
    }
    return hcData;
  }, [hoverComp]);

// console.log("TreemapGraph::HoverCompData", HoverCompData)

  React.useEffect(() => {

    if (!(width && height)) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    if (!data.length) {
      dispatch({
        type: "update-state",
        adjustedWidth,
        adjustedHeight,
        treemapData: []
      });
    }
    else {
      const getChildren = d => {
        return Array.isArray(d) ? d[1] : null
      };

      const hierarchy = d3hierarchy([null, data], getChildren)
                    .sum(([i, d]) => {
                      if (typeof d === "number") {
                        return d;
                      }
                      return 0.0;
                    })
                    // .sort((a, b) => b.value - a.value);

      const treemap = d3treemap()
                        .tile(TileMethodMap[tileMethod] || treemapSquarify)
                        // .padding(1)
                        // .paddingInner(2.0)
                        // .paddingOuter(2.0)
                        .size([adjustedWidth, adjustedHeight])(hierarchy);

      dispatch({
        type: "update-state",
        adjustedWidth,
        adjustedHeight,
        treemapData: [treemap]
      });
    }
  }, [data, Margin, width, height, colorFunc, tileMethod]);

  const {
    onMouseMove,
    onMouseLeave,
    hoverData
  } = useHoverComp(ref);

  const {
    HoverComp,
    position,
    show: showHoverComp,
    ...hoverCompRest
  } = HoverCompData;

// console.log("TreemapGraph::state.treemapData", state.treemapData);
  
  return (
  	<div className="avl-graph-container" ref={ ref }>

      <svg className={ `w-full h-full block avl-graph ${ className }` }>
        <g onMouseLeave={ onMouseLeave }
          style={ {
            transform: `translate(${ Margin.left }px, ${ Margin.top }px)`
          } }>

          { state.treemapData?.map((n, i) => (
          		<Rect key="root" isRoot
          			colorFunc={ colorFunc }
          			color="transparent"
          			node={ n }
          			onMouseMove={ onMouseMove }
                indexTextSize={ indexTextSize }
                valueTextSize={ valueTextSize }
                valueFormat={ HoverCompData.valueFormat }
                highlights={ highlights }
                onRectEnter={ onRectEnter }
                onRectLeave={ onRectLeave }/>
          	))
          }

        </g>
      </svg>

      { !showHoverComp ? null :
        <HoverCompContainer { ...hoverData } theme={ theme }
          position={ position }
          svgWidth={ width }
          svgHeight={ height }
          margin={ Margin }>
          { !hoverData.data ? null :
            <HoverComp data={ hoverData.data }
              { ...hoverCompRest }/>
          }
        </HoverCompContainer>
      }

  	</div>
  )
}

const IndexTextSizeMap = {
  xsmall: 0.1,
  small: 0.2,
  medium: 0.3,
  large: 0.4,
  xlarge: 0.5
}

const getUniqueClipPathId = () => getUniqueId(`clip-path-`);

const Rect = React.memo(({ node, isRoot, colorFunc, ...props }) => {

  const {
    color,
    onMouseMove,
    indexTextSize,
    valueTextSize,
    valueFormat,
    onRectEnter,
    onRectLeave,
    highlights,
    highlight = false
  } = props;

  const [itSize, vtSize] = React.useMemo(() => {
    return [
      IndexTextSizeMap[indexTextSize] || IndexTextSizeMap["medium"],
      (IndexTextSizeMap[valueTextSize] || IndexTextSizeMap["medium"]) * 0.5
    ]
  }, [indexTextSize, valueTextSize]);

  const id = React.useMemo(() => {
    return getUniqueClipPathId();
  }, []);

  // const rgbaColor = React.useMemo(() => {
  // 	const alpha = Math.max(0.2, 1.0 - (node.depth - 2) * 0.15);
  // 	return color2rgba(color, alpha);
  // }, [node, color]);

  const doHighlight = React.useMemo(() => {
    if (node.depth === 0) return false;

    if (highlight) return true;

    const index = node.depth === 1 ? node.data[0] : node.parent.data[0];
    const key = node.depth === 2 ? node.data[0] : undefined;
    
    if (node.depth === 1) {
      const filtered = highlights.filter(h => h.type === "index" && h.value == index);
      return Boolean(filtered.length);
    }
    if (node.depth === 2) {
      const filtered = highlights.filter(h => h.type === "key" && h.value == key);
      return Boolean(filtered.length);
    }
  }, [highlights, highlight, node]);

  const actualColor = React.useMemo(() => {
    return doHighlight ? "#ff0000" : color;
  }, [color, doHighlight]);

  const [x, y, width, height, strokeWidth] = React.useMemo(() => {
    const w = node.x1 - node.x0;
    const h = node.y1 - node.y0;
    const sw = w <= 5 || h <= 5 ? "0.5" : "1.0";
    return [node.x0, node.y0, w, h, sw];
  }, [node]);

  const doOnMouseMove = React.useCallback(e => {
  	onMouseMove(e, node);
  }, [node, onMouseMove]);

  const onMouseEnter = React.useMemo(() => {
    if (node.depth === 0) return null;
    if (typeof onRectEnter !== "function") return null;
    const index = node.depth === 1 ? node.data[0] : node.parent.data[0];
    const key = node.depth === 2 ? node.data[0] : undefined;
    return e => onRectEnter(e, { node, index, key });
  }, [onRectEnter, node]);

  const onMouseLeave = React.useMemo(() => {
    if (node.depth === 0) return null;
    if (typeof onRectLeave !== "function") return null;
    const index = node.depth === 1 ? node.data[0] : node.parent.data[0];
    const key = node.depth === 2 ? node.data[0] : undefined;
    return e => onRectLeave(e, { node, index, key });
  }, [onRectLeave, node]);

  const label = React.useMemo(() => {
    if (node.depth < 2) return null;
    return node.data[0];
  }, [node]);

	return (
		<g>
    	<rect className="avl-rect"
        stroke="#666" strokeWidth={ strokeWidth }
        x={ x } width={ width }
        y={ y } height={ height }
    		onMouseMove={ doOnMouseMove }
        onMouseEnter={ onMouseEnter }
        onMouseLeave={ onMouseLeave }
        fill={ node.depth < 2 ? "none" : actualColor }/>

      <defs>
        <clipPath id={ id }>
          <rect
            x={ x } width={ width }
            y={ y } height={ height }
            transform={ `rotate(${ width > height ? "0" : "-90" }, ${ x + width * 0.5 }, ${ y + height * 0.5 })` }/>
        </clipPath>
      </defs>

      { label === null ? null :
        <text 
          textAnchor="middle"
          dominantBaseline="ideographic"
          x={ x + width * 0.5 }
          y={ y + height * 0.5 }
          fontSize={ Math.min(width, height) * itSize }
          className="pointer-events-none font-medium"
          transform={ `rotate(${ width > height ? "0" : "-90" }, ${ x + width * 0.5 }, ${ y + height * 0.5 })` }
          clipPath={ `url(#${ id })` }
        >
          { label }
        </text>
      }

      { label === null ? null :
        <text 
          textAnchor="middle"
          dominantBaseline="hanging"
          x={ x + width * 0.5 }
          y={ y + height * 0.5 }
          fontSize={ Math.min(width, height) * vtSize }
          className="pointer-events-none"
          transform={ `rotate(${ width > height ? "0" : "-90" }, ${ x + width * 0.5 }, ${ y + height * 0.5 })` }
          clipPath={ `url(#${ id })` }
        >
          { valueFormat(node.value) }
        </text>
      }

    	{ node.children?.map((n, i) => (
    			<Rect key={ n.data[0] } { ...props }
    				node={ n }
    				color={ isRoot ? colorFunc(n.data[1], i, n.data[0], n) : actualColor }
    				onMouseMove={ onMouseMove }
            valueFormat={ valueFormat }/>
    		))
    	}
    </g>
  )
})