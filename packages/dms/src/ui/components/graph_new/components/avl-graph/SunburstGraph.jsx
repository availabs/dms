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

import { useSetSize } from "./utils"

import {
  getColorFunc,
  Identity,
  EmptyArray,
  EmptyObject
} from "./utils"

const DefaultHoverComp = ({ data: node, indexFormat, keyFormat, valueFormat }) => {

	const label = React.useMemo(() => {

		const isRoot = node.depth === 0;
		const isIndex = node.depth == 1;
		const isCat = node.depth === 2;

		const format = isIndex ? indexFormat :
										isCat ? keyFormat :
										Identity;

		const makeLabel = (node, label = "") => {
			if (node.parent) {
				return makeLabel(node.parent, `${ format(node.data[0]) } ${ label }`);
			}
			return isRoot ? "Total" : label;
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

const rgbRegex = /^rgb\((\d{1, 3}),\s*(\d{1, 3}),\s*(\d{1, 3})\)/;
const rgbaRegex = /^rgba\((\d{1, 3}),\s*(\d{1, 3}),\s*(\d{1, 3}),\s*(\d{1, 3})\)/;
const hexRegex = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/;

const color2rgba = (color, alpha) => {

	alpha = Math.max(0.0, Math.min(alpha, 1.0));

	if (rgbRegex.test(color)) {
		const [, r, g, b] = rgbaRegex.exec(color);
		return `rgba(${ r }, ${ g }, ${ b }, ${ alpha }`;
	}

	if (rgbaRegex.test(color)) {
		const [, r, g, b] = rgbaRegex.exec(color);
		return `rgba(${ r }, ${ g }, ${ b }, ${ alpha }`;
	}

	if (hexRegex.test(color)) {
		const [, hr, hg, hb] = hexRegex.exec(color);
		const r = parseInt(hr, 16).toString();
		const g = parseInt(hg, 16).toString();
		const b = parseInt(hb, 16).toString();
		return `rgba(${ r }, ${ g }, ${ b }, ${ alpha })`;
	}

	return color;
}

const Slice = React.memo(({ node, colorFunc, color, isRoot, onMouseMove }) => {

  const ref = React.useRef();

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

  const doOnMouseMove = React.useCallback(e => {
  	onMouseMove(e, node);
  }, [node, onMouseMove]);

	return (
		<g>
    	<path ref={ ref } className="avl-slice" stroke="none"
    		onMouseMove={ doOnMouseMove }/>
    	{ node.children?.map((n, i) => (
    			<Slice key={ n.data[0] }
    				node={ n }
    				color={ isRoot ? colorFunc(n, i) : color }
    				onMouseMove={ onMouseMove }/>
    		))
    	}
    </g>
  )
})