import React from "react"

import * as d3shape from "d3-shape"
import { select as d3select } from "d3-selection"
import {
  hierarchy as d3hierarchy,
  partition as d3partition
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
  sunburstData: [],
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
      const { sunburstData } = state;
      let prevIds = sunburstData.reduce((a, c) => {
        a[c.index] = c;
        return a;
      }, {});
      payload.sunburstData.forEach(pie => {
        if (pie.index in prevIds) {
          pie.state = "updating";
          delete prevIds[pie.index];
        }
      })
      if (!showAnimations) {
        prevIds = {};
      }
      return {
        sunburstData: [
          ...payload.sunburstData,
          ...Object.values(prevIds).map(p => ({ ...p, state: "exiting" }))
        ],
        exiting: Object.keys(prevIds)
      }
    }
    case "exit-data":
      return {
        sunburstData: state.sunburstData.filter(pie => {
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

export const SunburstGraph = props => {

  const {
    data = EmptyArray,
    margin = EmptyObject,
    hoverComp = EmptyObject,
    indexTextSize = "medium",
    valueTextSize = "medium",
    className ="",
    startAngle = 0,
    endAngle = 2 * Math.PI,
    padAngle = 0,
    colors,
    showAnimations = false
  } = props;

// console.log("SunburstGraph::data", data);

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

  React.useEffect(() => {

    if (!(width && height)) return;

    const adjustedWidth = Math.max(0, width - (Margin.left + Margin.right)),
      adjustedHeight = Math.max(0, height - (Margin.top + Margin.bottom));

    const children = d => {
    	return Array.isArray(d) ? d[1] : null
    };

    const hierarchy = d3hierarchy([null, data], children)
                  .sum(([i, d]) => {
                    if (typeof d === "number") {
                      return d;
                    }
                    return 0.0;
                  })
                  // .sort((a, b) => b.value - a.value);

    const partitions = d3partition().size([Math.PI * 2, adjustedHeight * 0.5])(hierarchy);

    dispatch({
    	type: "update-state",
    	adjustedWidth,
    	adjustedHeight,
    	sunburstData: [partitions]
    })

  }, [data, Margin, width, height, colorFunc]);

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

// console.log("SunburstGraph::state.sunburstData", state.sunburstData);
  
  return (
  	<div className="avl-graph-container" ref={ ref }>

      <svg className={ `w-full h-full block avl-graph ${ className }` }>
        <g onMouseLeave={ onMouseLeave }
          style={ {
            transform: `translate(${ Margin.left + state.adjustedWidth * 0.5 }px, ${ Margin.top + state.adjustedHeight * 0.5 }px)`
          } }>

          { state.sunburstData?.map((n, i) => (
          		<Slice key="root" isRoot
          			colorFunc={ colorFunc }
          			color="#666"
          			node={ n }
                indexTextSize={ indexTextSize }
                valueTextSize={ valueTextSize }
                valueFormat={ HoverCompData.valueFormat }
          			onMouseMove={ onMouseMove }/>
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

const getUniqueTextPathId = () => getUniqueId(`text-path-`);

const labelTransform = node => {
  const x = (node.x0 + node.x1) / 2 * 180 / Math.PI;
  const y = (node.y0 + node.y1) / 2;
  return `rotate(${ x - 90 }) translate(${ y }, 0) rotate(${ x < 180 ? 0 : 180 })`;
}

const IndexTextSizeMap = {
  xsmall: 0.1,
  small: 0.2,
  medium: 0.3,
  large: 0.4,
  xlarge: 0.5
}

const Slice = React.memo(({ node, colorFunc, isRoot, ...props }) => {

  const {
    color,
    onMouseMove,
    indexTextSize,
    valueTextSize,
    valueFormat
  } = props;

  const ref = React.useRef();

  const doOnMouseMove = React.useCallback(e => {
  	onMouseMove(e, node);
  }, [node, onMouseMove]);

  const id = React.useMemo(() => {
    return getUniqueTextPathId();
  }, []);

  const [itSize, vtSize] = React.useMemo(() => {
    return [
      IndexTextSizeMap[indexTextSize] || IndexTextSizeMap["medium"],
      (IndexTextSizeMap[valueTextSize] || IndexTextSizeMap["medium"]) * 0.5
    ]
  }, [indexTextSize, valueTextSize]);

  const rgbaColor = React.useMemo(() => {
  	const alpha = Math.min(1.0, 1.0 - (node.depth - 1) * 0.15);
  	return color2rgba(color, alpha);
  }, [node, color]);

  React.useEffect(() => {

  	const arc = d3shape.arc()
      .innerRadius(node.y0)
      .outerRadius(node.y1)
      .startAngle(node.x0)
      .endAngle(node.x1)
      .padAngle(0)
      .cornerRadius(0);

    d3select(ref.current)
    	.attr("d", arc())
    	.attr("fill", rgbaColor);

  }, [node, rgbaColor]);

  const [width, height] = React.useMemo(() => {
  	return [
  		2 * (node.x1 - node.x0) * (node.y0 + (node.y1 - node.y0) * 0.5),
  		node.y1 - node.y0
  	];
  }, [node]);

  const textPath = React.useMemo(() => {
  	if (width >= 200) {
  		return d3shape.arc()
	      .innerRadius(node.y0 + (node.y1 - node.y0) * 0.5)
	      .outerRadius(node.y0 + (node.y1 - node.y0) * 0.5)
	      .startAngle(node.x0)
	      .endAngle(node.x1)
	      .padAngle(0)
	      .cornerRadius(0)()
  	}
	  return null
  }, [node]);

  const startOffset = React.useMemo(() => {
  	const avgAngle = node.x0 + (node.x1 - node.x0) * 0.5;
  	const PI = Math.PI;
  	return avgAngle > PI * 0.5 && avgAngle < PI * 1.5 ? "75%" : "25%";
  }, [node])

	return (
		<g>
    	<path ref={ ref } className="avl-slice" stroke="none"
    		onMouseMove={ doOnMouseMove }/>

    	<defs>
    		<path id={ id } d={ textPath } fill="none" stroke="none"/>
    	</defs>

    	{ node.depth === 0 ?
	    		<>
	    			<text
			    		textAnchor="middle"
			        dominantBaseline="ideographic"
		    			className="pointer-events-none font-medium"
		          fontSize={ Math.min(width, height) * itSize }
	    			>
			    		Total
	    			</text>
	    			<text
			    		textAnchor="middle"
			        dominantBaseline="hanging"
		    			className="pointer-events-none"
		          fontSize={ Math.min(width, height) * vtSize }
	    			>
			    		{ valueFormat(node.value) }
	    			</text>
	    		</> :
    		width < 200 ? 
	    		<>
	    			<text
			    		textAnchor="middle"
			        dominantBaseline="ideographic"
			    		transform={ labelTransform(node) }
		    			className="pointer-events-none font-medium"
		          fontSize={ Math.min(width, height) * itSize * 0.5 }
	    			>
			    		{ node.data[0] }
	    			</text>
	    			<text
			    		textAnchor="middle"
			        dominantBaseline="hanging"
			    		transform={ labelTransform(node) }
		    			className="pointer-events-none"
		          fontSize={ Math.min(width, height) * vtSize * 0.5 }
	    			>
			    		{ valueFormat(node.value) }
	    			</text>
	    		</> :
	    		<>
			    	<text>
			    		<textPath href={ `#${ id }` }
			    			startOffset={ startOffset }
			          dominantBaseline="ideographic"
			    			textAnchor="middle"
			    			className="pointer-events-none font-medium"
		          	fontSize={ Math.min(width, height) * itSize }
			    		>
			    			{ node.data[0] || "Total" }
			    		</textPath>
			    	</text>
			    	<text>
			    		<textPath href={ `#${ id }` }
			    			startOffset={ startOffset }
			          dominantBaseline="hanging"
			    			textAnchor="middle"
		    				className="pointer-events-none"
	          		fontSize={ Math.min(width, height) * vtSize }
			    		>
			    			{ valueFormat(node.value) }
			    		</textPath>
			    	</text>
			    </>
    	}

    	{ node.children?.map((n, i) => (
    			<Slice key={ n.data[0] } { ...props }
    				node={ n }
    				color={ isRoot ? colorFunc(n, i) : color }
    				onMouseMove={ onMouseMove }/>
    		))
    	}
    </g>
  )
})