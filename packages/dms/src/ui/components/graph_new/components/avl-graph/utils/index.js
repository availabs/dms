import React from "react"
import colorbrewer from "colorbrewer"
import isEqual from "lodash/isEqual"
import get from "lodash/get"

import {
  scaleBand,
  scalePoint,
  scaleOrdinal,
  scaleLinear,
  scalePow,
  scaleLog,
  scaleSymlog,
  scaleQuantize,
  scaleQuantile
} from "d3-scale"

const ColorRanges = {}

for (const type in colorbrewer.schemeGroups) {
  colorbrewer.schemeGroups[type].forEach(name => {
    const group = colorbrewer[name];
    for (const length in group) {
      if (!(length in ColorRanges)) {
        ColorRanges[length] = [];
      }
      ColorRanges[length].push({
        type: `${ type[0].toUpperCase() }${ type.slice(1) }`,
        name,
        category: "Colorbrewer",
        colors: group[length]
      })
    }
  })
}

export { ColorRanges };
// console.log("ColorRanges", ColorRanges);

export const getColorRange = (size, name, reverse=false) => {
  let range = get(ColorRanges, [size], [])
    .reduce((a, c) => c.name === name ? c.colors : a, []).slice();
  if(reverse) {
    range.reverse()
  }
  return range
}

export const DEFAULT_COLORS = getColorRange(12, "Set3");

export const getColorFunc = colors => {

  if (typeof colors === "function") {
    return colors;
  }

  let colorRange = [...DEFAULT_COLORS];

  if (typeof colors === "string") {
    const [k1, k2, reverse = false] = colors.split("-");
    colorRange = getColorRange(k1, k2);
    reverse && colorRange.reverse();
  }
  else if (Array.isArray(colors) && colors.length) {
    colorRange = [...colors];
  }

  return (d, i) => {
    return colorRange[i % colorRange.length];
  }
}

export const strictNaN = v => (v === null) || isNaN(v);

export const DefaultXScale = {
  type: "band",
  domain: []
}
export const DefaultYScale = {
  type: "linear",
  domain: []
}

const ScaleMap = {
  "band": scaleBand,
  "point": scalePoint,
  "ordinal": scaleOrdinal,
  "linear": scaleLinear,
  "power": scalePow,
  "log": scaleLog,
  "symlog": scaleSymlog,
  "quantize": scaleQuantize,
  "quantile": scaleQuantile
}

export const getScale = options => {
  let {
    type,
    domain,
    range,
    data,
    padding,
    paddingInner,
    paddingOuter,
    getter,
    exponent = 1,
    base = 10
  } = options;

  if (!domain?.length) {
    domain = getter(data);
  }

  const scale = ScaleMap[type]()
    .domain(domain)
    .range(range);

  if (type === "band") {
    scale.paddingInner(padding || paddingInner)
      .paddingOuter(padding || paddingOuter);
  }
  if (type === "point") {
    scale.paddingOuter(padding || paddingOuter);
  }
  if (type === "power") {
    scale.exponent(exponent);
  }
  if (type === "log") {
    scale.base(base);
  }
  return scale
}

export const Identity = i => i;

export const EmptyArray = [];

export const EmptyObject = {};

export const DefaultMargin = {
  left: 70,
  top: 20,
  right: 20,
  bottom: 30
};

export const DefaultAxis = {
  min: 0
}

// export const useHoverCompData = 

export const useShouldComponentUpdate = (props, width, height, additionalKeys = []) => {

  const prevProps = React.useRef({});
  const prevSize = React.useRef([null, null]);

  return React.useMemo(() => {
    if (!(width && height)) return false;
    
    const keys = get(props, "shouldComponentUpdate", []);
    if (keys.length) {
      keys.push(...additionalKeys);
    }

    const should = !isEqual([width, height], prevSize.current) ||
      keys.reduce((a, c) => {
        return a || !isEqual(get(prevProps, ["current", c]), get(props, c));
      }, !Boolean(keys.length));

    prevProps.current = keys.reduce((a, c) => {
      a[c] = props[c];
      return a;
    }, {});
    prevSize.current = [width, height];

    return should;
  }, [props, width, height, additionalKeys]);
}

const DEFAULT_SIZE = { width: 0, height: 0 };

const getBoundingClientRect = node => {
  if (!node) return null;
  return node.getBoundingClientRect();
}

export const useSetSize = (ref, callback) => {

  const node = "current" in ref ? ref.current : ref;

  const [size, setSize] = React.useState(null);

  const doSetSize = React.useCallback(() => {
    const rect = getBoundingClientRect(node);
    if ((rect?.width !== size?.width) || (rect?.height !== size?.height)) {
      if (typeof callback === "function") {
        callback(rect);
      }
      setSize(rect);
    }
  }, [node, size, callback]);

  React.useEffect(() => {
    if (node && !size) {
      doSetSize();
    }
  }, [node, size, doSetSize]);

  React.useEffect(() => {
    window.addEventListener("resize", doSetSize);
    return () => {
      window.removeEventListener("resize", doSetSize);
    }
  }, [doSetSize]);

  return size || DEFAULT_SIZE;
}

export const theme = {
  textBase: "text-base",
    textSmall: "text-sm",
    textLarge: "text-lg",
    paddingBase: "py-1 px-2",
    paddingSmall: "py-0 px-1",
    paddingLarge: "py-2 px-4",

    contentBg: "bg-white",

    accent1: "bg-blue-100",
    accent2: "bg-gray-300",
    accent3: "bg-gray-400",
    accent4: "bg-gray-500",

    highlight1: "bg-blue-200",
    highlight2: "bg-blue-300",
    highlight3: "bg-blue-400",
    highlight4: "bg-blue-500"

}
