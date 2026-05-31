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
  useHoverComp
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

const DefaultHoverComp = ({ data: node, indexFormat, keyFormat, valueFormat }) => {

	const label = React.useMemo(() => {



		// const makeLabel = (node, label = "") => {
		// 	if (node.parent) {
		// 		return makeLabel(node.parent, `${ format(node.data[0]) } ${ label }`);
		// 	}
		// 	return isRoot ? "Total" : label;
		// }

		const makeLabel = (node, label = "") => {
			if (!node) {
				return label || "total";
			}
			const d = node.data[0];
			if (d === null || d === undefined) {
				return makeLabel(node.parent, label);
			}

			const isIndex = node.depth == 1;
			const isCat = node.depth === 2;

			const format = isIndex ? indexFormat :
											isCat ? keyFormat :
											Identity;

			return makeLabel(node.parent, `${ format(d) } ${ label }`);
		}

		return makeLabel(node);
	}, [node, indexFormat, keyFormat]);

  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded min-w-40
    ` }>
    	<div className="font-bold text-lg leading-6 border-b-2">
    		{ label }
    	</div>
    	<div className="text-right">
    		{ valueFormat(node.value) }
    	</div>
    </div>
  )
}

const DefaultHoverCompData = {
  HoverComp: DefaultHoverComp,
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
    tileMethod = "treemapSquarify",
    indexTextSize = "medium",
    valueTextSize = "medium",
    className ="",
    startAngle = 0,
    endAngle = 2 * Math.PI,
    padAngle = 0,
    colors,
    showAnimations = false
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
  	return getColorFunc(colors);
  }, [colors]);

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
                valueFormat={ HoverCompData.valueFormat }/>
          	))
          }

        </g>
      </svg>

      { !showHoverComp ? null :
        <HoverCompContainer { ...hoverData }
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
    valueFormat
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

  const [x, y, width, height, strokeWidth] = React.useMemo(() => {
    const w = node.x1 - node.x0;
    const h = node.y1 - node.y0;
    const sw = w <= 5 || h <= 5 ? "0.5" : "1.0";
    return [node.x0, node.y0, w, h, sw];
  }, [node]);

  const doOnMouseMove = React.useCallback(e => {
  	onMouseMove(e, node);
  }, [node, onMouseMove]);

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
        fill={ node.depth < 2 ? "none" : color }/>

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
          className="pointer-events-none"
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
    				color={ isRoot ? colorFunc(n.data[1], i, n.data[0], n) : color }
    				onMouseMove={ onMouseMove }
            valueFormat={ valueFormat }/>
    		))
    	}
    </g>
  )
})