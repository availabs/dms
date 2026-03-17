import React from "react";
import { get, set, isEqual } from "lodash-es"

import { AvlLayer } from "../../../../../../../ui/components/map";
import { ThemeContext } from "../../../../../../../ui/themeContext";
import { Legend, ColorBar, getScale } from "./legend-components";
import { ColorRanges, getColorRange } from "./utils/color-ranges";
import ckmeans from "./utils/ckmeans";
import * as d3scale from "d3-scale";
import {
  extent as d3extent,
  range as d3range
} from "d3-array"

import { DatasetsContext } from "../../../../../context";
import { getExternalEnv } from "../../../../../utils/datasources";

const PIN_OUTLINE_LAYER_SUFFIX = 'pin_outline'
const NO_FILTER_LAYER_SUFFIX = 'static'

const HoverComp = ({ data, layer }) => {
  const { attributes, activeViewId, filters } = layer;
  const { datasources, falcor, falcorCache } = React.useContext(DatasetsContext);
  const pgEnv = getExternalEnv(datasources);
  const id = React.useMemo(() => get(data, "[0]", null), [data]);

  let getAttributes = (typeof attributes?.[0] === 'string' ?
    attributes : attributes.map(d => d.name)).filter(d => !['wkb_geometry'].includes(d))

  
  React.useEffect(() => {
    falcor.get([
      "dama",
      pgEnv,
      "viewsbyId",
      activeViewId,
      "databyId",
      id,
      getAttributes
    ])
    //.then(d => console.log('got attributes', d));
  }, [falcor, pgEnv, activeViewId, id, attributes]);

  const attrInfo = React.useMemo(() => {
    return get(
      falcorCache,
      ["dama", pgEnv, "viewsbyId", activeViewId, "databyId", id],
      {}
    );
  }, [id, falcorCache, activeViewId, pgEnv]);

  
  return (
    <div className="bg-white p-4 max-h-64 max-w-lg scrollbar-xs overflow-y-scroll">
      <div className="font-medium pb-1 w-full border-b ">
        {layer.source.display_name}
      </div>
      {Object.keys(attrInfo).length === 0 ? `Fetching Attributes ${id}` : ""}
      {Object.keys(attrInfo)
        .filter((k) => typeof attrInfo[k] !== "object")
        .map((k, i) => (
          <div className="flex border-b pt-1" key={i}>
            <div className="flex-1 font-medium text-sm pl-1">{k}</div>
            <div className="flex-1 text-right font-thin pl-4 pr-1">
              {attrInfo?.[k]}
            </div>
          </div>
        ))}
    </div>
  );
};

const LegendCmp = ({ domain, range, title }) => {
  const getDomainRanges = (domain) => {
    const ranges = [];
    if (!(domain && domain.length)) return range;
    ranges.push(`0 - ${new Intl.NumberFormat().format(domain[0])}`);
    for (let i = 0; i < domain.length - 1; i++) {
      ranges.push(`${new Intl.NumberFormat().format(domain[i])} - ${new Intl.NumberFormat().format(domain[i + 1])}`);
    }
    return ranges;
  };
  const newRanges = getDomainRanges(domain);

  const smallLen = React.useMemo(() => {
    return Math.min(domain.length, range.length);
  }, [domain.length, range.length]);

  return (
    <>
      <div className="shadow-lg box-content min-h-32 min-w-48 w-fit p-1 border-2 bg-slate-50 bg-opacity-55">
        <div className="flex mb-1"><div className="flex-1 font-medium">{title}</div></div>
        {Array.from({ length: smallLen }).map((_, i) =>
          <>
            <div className="flex m-2">
              <div className="flex-none w-16">
                <div className="h-8 w-[2px] rounded dark:ring-1 dark:ring-inset dark:ring-white/10 sm:w-full" style={{
                  backgroundColor: range[i],
                  transition: "background-color 0.5s"
                }} />
              </div>
              <div className="flex-initial ml-6 w-32">
                {
                  <div className="h-6 w-2 ml-1 p-[2px] sm:w-full text-left">
                    {newRanges[i]}</div>
                }
              </div>
            </div>
          </>
        )
        }
      </div>
    </>
  )
}

export const LegendContainer = ({ name, title, toggle, isOpen, children }) => {
  return (
    <div className="p-1 rounded bg-white">
      <div className="p-1 relative rounded border pointer-events-auto">
        <div className="flex mb-1">
          <div className="flex-1 font-medium">{ name || title }</div>
        </div>
        <div>{ children }</div>
      </div>
    </div>
  )
}

const strictNaN = v => (v === null) || isNaN(v);
const ordinalSort = (a, b) => {
  return String(a).localeCompare(String(b));
}

const calcDomain = (type, data, length) => {
  const values = data.map(d => strictNaN(d.value) ? d.value : +d.value);
  switch (type) {
    case "quantize":
      return d3extent(values);
    case "threshold":
      return ckmeans(values.filter(Boolean), length ? length - 1 : 6);
    case "ordinal":
      return [...new Set(values)].sort(ordinalSort);
    default:
      return values;
  }
}
const calcRange = (type, length, color, reverse) => {
  switch (type) {
    case "threshold":
      return getColorRange(length ? length + 1 : 7, color, reverse);
    case "ordinal":
      return getColorRange(Math.min(12, length), color, reverse);
    default:
      return getColorRange(7, color, reverse);
  }
}

const GISDatasetRenderComponent = props => {
  const {
    layerProps,
    resourcesLoaded,
    maplibreMap,
    activeLayers
  } = props;

  const {
    filters,
    activeViewId,
    symbology,
    updateLegend,
    sourceId,
    layers
  } = layerProps;
  const activePins = activeLayers[0].state.pinnedHoverCompIds;

  const activeVar = get(filters, ["activeVar", "value"], "");

  const [legend, setLegend] = React.useState(null);
  const [layerData, setLayerData] = React.useState(null);

  const { datasources, falcor, falcorCache, ...rest } = React.useContext(DatasetsContext);
  const pgEnv = getExternalEnv(datasources);

  const createLegend = React.useCallback((settings = {}) => {

    const {
      domain = [],
      range = [],
      format = ".2s",
      name,
      title,
      type = "threshold",
      data = [],
      color = "BrBG",
      reverse = false,
      height = 3,
      direction = 'vertical',
      customLegendScale
    } = settings;

    const legend = {
      domain,
      range,
      format,
      name,
      title,
      type,
      data,
      color,
      reverse,
      height,
      direction,
      customLegendScale
    };

    if (!domain.length) {
      legend.domain = calcDomain(type, data, range.length);
    }
    if (!range.length) {
      legend.range = calcRange(type, legend.domain.length, color, reverse);
    }

    setLegend(legend);
  }, []);

  const prevLegend = React.useRef(null);

  React.useEffect(() => {
    if (!legend) return;

    const { data, domain, ...rest } = legend;

    if (legend && !prevLegend.current) {
      prevLegend.current = rest;
      return;
    }

    if (!isEqual(rest, prevLegend.current)) {
      prevLegend.current = rest;

      const toSave = JSON.parse(JSON.stringify(symbology));

      layers.forEach(({ id, type }) => {
        set(toSave, `${id}.${type}-color.${activeVar}.settings`, {
          ...rest
        });
        // toSave[id][`${ type }-color`][activeVar].settings = {
        //   ...rest
        // }
      });

      falcor.call(
        ["dama", "sources", "metadata", "update"],
        [pgEnv, sourceId, { symbology: toSave }]
      ).then(res => console.log("SAVE RESPONSE:", res))
    }
  }, [falcor, pgEnv, sourceId, legend, symbology, activeVar, layers]);

  React.useEffect(() => {
    const pinnedIds = activePins?.map(pin => pin.ogc_fid);
    const pinnedGeomLineLayer = layers.find(layer => layer.id.includes(PIN_OUTLINE_LAYER_SUFFIX));

    if(pinnedGeomLineLayer){
      const lineLayerId = pinnedGeomLineLayer.id;
      if(pinnedIds.length === 0){
        pinnedIds.push(-666666666)
      }
      const dataFilter = [
        "match",
        ["get", "ogc_fid"],
        pinnedIds,
        true,
        false,
      ];
      const mapLayer = maplibreMap.getLayer(lineLayerId);
      if (mapLayer) {
        maplibreMap.setFilter(lineLayerId, dataFilter);
        if(pinnedIds?.length){
          maplibreMap.setPaintProperty(lineLayerId, 'line-opacity', 1);
        }
        else{
          maplibreMap.setPaintProperty(lineLayerId, 'line-opacity', 0);
        }
      }
    }
  }, [maplibreMap, symbology, activePins])


  React.useEffect(() => {
    async function loadMapData () {
      if (!maplibreMap) return;
      const sources = get(symbology, "sources", []);
      const layers = get(symbology, "layers", []);
      const images = get(symbology, "images", []);

      //console.log('set sources', sources, layers,images)
      if (Array.isArray(images)) {
        await Promise.all(
            images
              .filter(img => !maplibreMap.hasImage(img.id) && img.url)
              .map(img => new Promise((resolve, reject) => {

                maplibreMap.loadImage(img.url, function (error, res) {
                    if (error) throw error;
                    if(!maplibreMap.hasImage(img.id)){
                      maplibreMap.addImage(img.id, res);
                    }
                    resolve();
                })
            }))
        )
      }


      if (Array.isArray(sources)) {
        sources.forEach(s => {
          if (!maplibreMap.getSource(s.id)) {
            maplibreMap.addSource(s.id, s.source);
          }
        })
      }

      if (Array.isArray(layers)) {
        layers.forEach(l => {
          if (!maplibreMap.getLayer(l.id)) {
            maplibreMap.addLayer(l);
          }
          else{
            if (l.layout && l.layout.visibility !== undefined){
              maplibreMap.setLayoutProperty(l.id, 'visibility', l.layout.visibility);
            }
          }
        })
      }
      // console.log('loadMapData done')
    }

    loadMapData()
  }, [maplibreMap, symbology]);

  const activeVariable = get(filters, ["activeVar", "value"], "");

  React.useEffect(() => {
    if (!maplibreMap) return;
    if (!resourcesLoaded) return;
    if (!activeVariable || (activeVariable === "none")) {
      //setLegend(null); // TODO ryan cehck about this -- otherwise this will wipe out our custom legend
      setLayerData(null);
      return;
    }
    (Object.keys(symbology || {}) || [])
      .forEach((layer_id) => {
        (
          Object.keys(symbology[layer_id] || {})
            .filter((paintProperty) => {
            const value =
              get(symbology, `[${paintProperty}][${activeVariable}]`, false) ||
              get(symbology, `[${paintProperty}][default]`, false) ||
              get(
                symbology,
                `[${layer_id}][${paintProperty}][${activeVariable}]`,
                false
              )
              || get(symbology, `[${layer_id}][${paintProperty}][default]`, false);
            return value;
          }) || []
        ).forEach((paintProperty) => {
          const sym =
            get(symbology, `[${paintProperty}][${activeVariable}]`, "") ||
            get(symbology, `[${paintProperty}][default]`, "") ||
            get(symbology, `[${layer_id}][${paintProperty}][${activeVariable}]`, "")
            || get(symbology, `[${layer_id}][${paintProperty}][default]`, "");


            // ----------- TIG -----------
            let { value, settings } = sym;

            if (!value && settings) {
              const { type, domain, range, data } = settings;
              const scale = getScale(type, domain, range);

              const colors = data.reduce((a, c) => {
                a[c.id] = scale(c.value);
                return a;
              }, {});

              value = ["get", ["to-string", ["get", "geoid"]], ["literal", colors]];
            }

            if(maplibreMap.getLayer(layer_id)?.id) {
              if(['visibility'].includes(paintProperty)) {
                maplibreMap.setLayoutProperty(layer_id, paintProperty, value);
              } else if (!layer_id.includes(PIN_OUTLINE_LAYER_SUFFIX)) {
                maplibreMap.setPaintProperty(layer_id, paintProperty, value);
              }
            }
            if(sym.settings) {
              createLegend(sym.settings)
            }
            // ----------- END TIG -----------

          // --------- Old ------------

          // if (sym.settings && sym.value) {
          //   console.log("Here 1");
          //   createLegend(sym.settings);
          //   setLayerData({ layer_id, paintProperty, value: sym.value });
          // }
          // else if (sym.settings) {
          //   console.log("Here 2");
          //   createLegend(sym.settings);
          //   setLayerData({ layer_id, paintProperty });
          // }
          // else if (sym.value) {
          //   console.log("Here 3");
          //   setLegend(null);
          //   setLayerData({ layer_id, paintProperty, value: sym.value });
          // }
          // else {
          //   console.log("Here 4");
          //   setLegend(null);
          //   setLayerData(null);
          // }
          // --------- Old ------------
        });
      });
  }, [maplibreMap, resourcesLoaded, symbology, activeVariable, createLegend]);

  React.useEffect(() => {
    if(symbology.legend){
      createLegend(symbology.legend)
    }
  }, [symbology?.legend])

  React.useEffect(() => {
    if (!legend) return;
    if (!layerData) return;

    const { layer_id, paintProperty } = layerData;
    let { value } = layerData;

    if (!value) {
      const { type, domain, range, data } = legend;

      const scale = getScale(type, domain, range);

      const colors = data.reduce((a, c) => {
        a[c.id] = scale(c.value);
        return a;
      }, {});

      value = ["get", ["to-string", ["get", "ogc_fid"]], ["literal", colors]];
    }

    if (maplibreMap.getLayer(layer_id)) {
      maplibreMap.setPaintProperty(layer_id, paintProperty, value);
    }
  }, [legend, layerData]);

  //Listens for changes to `symbology` and repaints if needed
  React.useEffect(() => {
    symbology?.layers?.forEach((layer) => {
      const mapLayer = maplibreMap.getLayer(layer.id);
      if (mapLayer) {
        if (layer.paint) {
          Object.keys(layer.paint).forEach((paintKey) => {
            const oldProp = maplibreMap.getPaintProperty(layer.id, paintKey);
            if (!isEqual(oldProp, layer.paint[paintKey])) {
              maplibreMap.setPaintProperty(
                layer.id,
                paintKey,
                layer.paint[paintKey]
              );
            }
          });
        }
      }
    });
  }, [symbology]);


  //If symbology contains `fitToBounds`, zoom to that location.
  React.useEffect(() => {
    if (maplibreMap && symbology && symbology.fitToBounds)
      maplibreMap.fitBounds(symbology.fitToBounds, {
        duration: 400,
        zoom: symbology.fitZoom || 13
      });
  }, [maplibreMap, symbology]);

  //If symbology contains `filter`, filter to matching features
  React.useEffect(() => {
    if (maplibreMap && symbology.filter) {
      const dataIdKey = symbology.filter?.dataKey ?? "ogc_fid";
      const idsToFilter = symbology.filter?.dataIds ?? symbology.filter;
      const dataFilter = [
        "match",
        ["get", dataIdKey],
        idsToFilter,
        true,
        false,
      ];

      symbology?.layers?.forEach((layer) => {
        const mapLayer = maplibreMap.getLayer(layer.id);
        if (mapLayer && !layer.id.includes(NO_FILTER_LAYER_SUFFIX)) {
          if(!layer.filter){
            maplibreMap.setFilter(layer.id, dataFilter);
          }
          else{
            //Append new filter to existing ones
            maplibreMap.setFilter(layer.id, ["all", layer.filter[1], dataFilter]);
          }
        }
      });
    }

    if (!symbology.filter && maplibreMap) {
      symbology?.layers?.forEach((layer) => {
        const mapLayer = maplibreMap.getLayer(layer.id);
        if (mapLayer && layer.filter) {
          maplibreMap.setFilter(layer.id, ["all", layer.filter[1]]);
        }
        else if (mapLayer){
          maplibreMap.setFilter(layer.id, ["all"]);
        }
      });
    }
  }, [maplibreMap, symbology.filter]);


  const [isOpen, setIsOpen] = React.useState(false);
  const close = React.useCallback(e => {
    setIsOpen(false);
  }, []);
  const toggle = React.useCallback(e => {
    setIsOpen(open => !open);
  }, []);

  const [ref, setRef] = React.useState();
  React.useEffect(() => {
    if (!ref) return;
    const handler = e => { if (!ref.contains(e.target)) close(e); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, close]);

  return !legend ? null : (
    <div ref={ setRef } className="absolute top-0 left-0 w-96 grid grid-cols-1 gap-4">
      <div className="z-10">
        {
          legend?.type === 'custom' ? 
            (
              <LegendContainer { ...legend }
                toggle={ toggle }
                isOpen={ isOpen }
              >
                <Legend { ...legend }/>
              </LegendContainer>
            ) : 
              <LegendCmp {...legend} />
        }
      </div>
      <div className="z-0">
        <LegendControls legend={ legend }
          updateLegend={ updateLegend }
          isOpen={ isOpen }
          close={ close }/>
      </div>
    </div>
  )
}

const RemoveDomainItem = ({ value, remove }) => {
  const doRemove = React.useCallback(e => {
    e.stopPropagation();
    remove(value);
  }, [value, remove]);
  return (
    <span onClick={ doRemove }
      className="px-2 flex items-center hover:bg-gray-200 rounded cursor-pointer text-red-500"
    >
      &times;
    </span>
  )
}
const DomainItem = ({ domain, index, disabled, remove, edit }) => {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");

  const startEditing = React.useCallback(e => {
    e.stopPropagation();
    setEditing(true);
    setValue(domain);
  }, [domain]);

  const stopEditing = React.useCallback(e => {
    e.stopPropagation();
    setEditing(false);
    setValue("");
  }, [domain]);

  const doEdit = React.useCallback(e => {
    e.stopPropagation();
    edit(value, index);
    setEditing(false);
    setValue("");
  }, [index, value, edit]);

  const [ref, setRef] = React.useState();

  React.useEffect(() => {
    if (ref && editing) {
      ref.focus();
      ref.select();
    }
  }, [ref, editing]);

  const [outter, setOutter] = React.useState();
  React.useEffect(() => {
    if (!outter) return;
    const handler = e => { if (!outter.contains(e.target)) stopEditing(e); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [outter, stopEditing]);

  return (
    <div ref={ setOutter }
      className="flex px-2 py-1 rounded cursor-pointer hover:bg-gray-100"
      onClick={ startEditing }
    >
      <div className="w-8 mr-1 py-1">({ index + 1 })</div>
      <div className="flex-1 mr-1">
        { editing ?
          <div className="flex">
            <div className="flex-1 mr-1">
              <input ref={ setRef }
                className="w-full px-2 py-1 border rounded text-sm"
                value={ value }
                onChange={ e => setValue(e.target.value) }/>
            </div>
            <button onClick={ doEdit }
              className="px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white">
              Edit
            </button>
          </div> :
          <div className="px-2 py-1">{ domain }</div>
        }
      </div>
      { disabled ? null :
        editing ?
        <button onClick={ stopEditing }
          className="px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white">
          Stop
        </button> :
        <RemoveDomainItem remove={ remove } value={ domain }/>
      }
    </div>
  )
}

const ThresholdEditor = ({ domain, range, updateLegend }) => {

  const removeDomain = React.useCallback(v => {
    updateLegend(domain.filter(d => d !== v));
  }, [domain, updateLegend]);

  const [value, setValue] = React.useState("");

  const addDomain = React.useCallback(e => {
    updateLegend([...domain, +value].sort((a, b) => a - b));
    setValue("");
  }, [domain, value, updateLegend]);

  const editDomain = React.useCallback((v, i) => {
    const newDomain = [...domain]
    newDomain.splice(i, 1, v);
    updateLegend(newDomain.sort((a, b) => a - b));
  }, [domain, updateLegend])

  const useCKMeans = React.useCallback(() => {
    updateLegend(undefined);
    setValue("");
  }, [updateLegend]);

  const disabled = React.useMemo(() => {
    return domain.length <= 2;
  }, [domain.length]);

  return (
    <div className="absolute left-full top-0"
      style={ { left: "CALC(100% + 1rem)" } }
    >
      <div className="bg-white p-1 pointer-events-auto rounded w-96">
        <div className="border rounded border-current relative">
          <div className="p-1 border-b border-current rounded-t flex font-bold bg-gray-100">
            Threshold Editor
          </div>
          <div className="p-1">
            <div className="grid grid-cols-1 gap-1">
              <div>Current Thresholds:</div>
              { domain.map((d, i) => (
                  <DomainItem key={ d }
                    domain={ d } index={ i }
                    remove={ removeDomain }
                    disabled={ disabled }
                    edit={ editDomain }/>
                ))
              }
              <div className="flex border-t pt-1">
                <div className="mr-1 flex-1">
                  <input type="number" placeholder="enter a threshold value..."
                    className="w-full px-2 py-1 border rounded text-sm"
                    onChange={ e => setValue(e.target.value) }
                    value={ value }/>
                </div>
                <button onClick={ addDomain } disabled={ !value }
                  className="px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <div>
                <button
                  onClick={ useCKMeans }
                  className="w-full px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Reset with 6 bins
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const BooleanSlider = ({ value, onChange }) => {
  const toggle = React.useCallback(e => {
    onChange(!value);
  }, [onChange, value]);
  return (
    <div onClick={ toggle }
      className="px-4 py-1 h-8 rounded flex items-center w-full cursor-pointer"
    >
      <div className="rounded flex-1 h-2 relative flex items-center bg-blue-100">
        <div className={ `w-4 h-4 rounded absolute ${ Boolean(value) ? "bg-blue-500" : "bg-gray-500" }` }
          style={ {
            left: Boolean(value) ? "100%" : "0%",
            transform: "translateX(-50%)",
            transition: "left 150ms"
          } }/>
      </div>
    </div>
  )
}

const LegendColorBar = ({ colors, name, reverse, range, updateLegend, test }) => {
  const isActive = React.useMemo(() => {
    return isEqual(colors, range);
  }, [colors, range]);

  const onClick = React.useCallback(() => {
    updateLegend(colors, name, reverse)
  }, [updateLegend, name, colors, reverse]);

  return (
    <div key={ name }
      onClick={ isActive ? null : onClick }
      className={ `
        outline outline-2 rounded-lg my-2
        ${ isActive ? "outline-black" : "outline-transparent cursor-pointer" }
      ` }
    >
      <ColorBar
        colors={ colors }
        height={ 3 }/>
    </div>
  )
}

const LegendControls = ({ legend, updateLegend, isOpen, close }) => {

  const updateLegendType = React.useCallback(type => {
    updateLegend({ ...legend, type, domain: undefined });
  }, [legend, updateLegend]);

  const updateLegendRange = React.useCallback((range, color, reverse) => {
    updateLegend({ ...legend, range, color, reverse, domain: undefined });
  }, [legend, updateLegend]);

  const updateLegendDomain = React.useCallback((domain, range = undefined) => {
    updateLegend({ ...legend, domain, range });
  }, [legend, updateLegend]);

  const [open, setOpen] = React.useState(-1);

  const [rangeSize, setRangeSize] = React.useState(get(legend, ["range", "length"], 7));

  const [reverseColors, setReverseColors] = React.useState(legend.reverse);

  const Colors = React.useMemo(() => {
    return get(ColorRanges, rangeSize, [])
      .map(({ colors, ...rest }) => ({
        ...rest,
        colors: reverseColors ? [...colors].reverse() : [...colors]
      }))
  }, [rangeSize, reverseColors]);

  return !isOpen ? null : (
    <div className="bg-white p-1 pointer-events-auto rounded w-96 relative">
      <div className="border rounded border-current relative">
        <div className="p-1 border-b border-current rounded-t flex font-bold bg-gray-100">
          <div className="flex-1">
            Legend Controls
          </div>
          <div className="flex-0">
            <span onClick={ close }
              className="px-2 py-1 rounded cursor-pointer hover:bg-gray-200"
            >
              &times;
            </span>
          </div>
        </div>
        <div className="p-1 grid grid-cols-1 gap-1">

          <div className="flex items-center px-1">
            <div className="w-40 text-right">Scale Type:</div>
            <div className="flex-1 ml-1">
              <TypeSelector { ...legend }
                updateLegend={ updateLegendType }/>
            </div>
          </div>

          <div className="flex items-center px-1">
            <div className="w-40 text-right">Number of Colors:</div>
            <div className="flex-1 ml-1">
              <RangeSizeSelector
                size={ rangeSize }
                onChange={ setRangeSize }/>
            </div>
          </div>

          <div className="flex items-center px-1">
            <div className="w-40 text-right">Reverse Colors:</div>
            <div className="flex-1">
              <BooleanSlider
                value={ reverseColors }
                onChange={ setReverseColors }/>
            </div>
          </div>

          <div className="border-b-2 border-current">
            Available Legend Colors:
          </div>

          <div className="overflow-auto px-2 rounded bg-gray-100 scrollbar-sm scrollbar-blue"
            style={ { height: "30rem" } }
          >
            { Colors.map(color => (
                <LegendColorBar key={ color.name }
                  { ...color } range={ legend.range }
                  updateLegend={ updateLegendRange }
                  reverse={ reverseColors }/>
              ))
            }
          </div>

        </div>
      </div>

      { legend.type !== "threshold" ? null :
        <ThresholdEditor { ...legend }
          updateLegend={ updateLegendDomain }/>
      }
    </div>
  )
}

const RangeSizes = d3range(3, 13);
const Identity = i => i;

const RangeSizeSelector = ({ size, onChange }) => {
  const { UI } = React.useContext(ThemeContext) || {};
  const Listbox = UI?.Listbox;
  const options = RangeSizes.map(s => ({ label: String(s), value: s }));
  return Listbox ? (
    <Listbox options={ options } value={ size } onChange={ onChange }/>
  ) : (
    <select value={ size } onChange={ e => onChange(+e.target.value) }
      className="w-full px-2 py-1 border rounded text-sm">
      { RangeSizes.map(s => <option key={s} value={s}>{s}</option>) }
    </select>
  )
}

const LegendTypes = [
  { value: "quantile", label: "Quantile" },
  { value: "threshold", label: "Threshold" },
  { value: "ordinal", label: "Ordinal" }
]

const TypeSelector = ({ type, updateLegend }) => {
  const { UI } = React.useContext(ThemeContext) || {};
  const Listbox = UI?.Listbox;
  return Listbox ? (
    <Listbox options={ LegendTypes } value={ type } onChange={ updateLegend }/>
  ) : (
    <select value={ type } onChange={ e => updateLegend(e.target.value) }
      className="w-full px-2 py-1 border rounded text-sm">
      { LegendTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>) }
    </select>
  )
}

class GISDatasetLayer extends AvlLayer {
  onHover = {
    layers: this.layers?.map((d) =>{
      console.log('on hover map', d.id)
      return d.id
    }),
    callback: (layerId, features, lngLat) => {

      let feature = features[0];

      let data = [feature.id, layerId, (features[0] || {}).properties];

      return data;
    },
    Component: this.hoverComp || HoverComp,
    isPinnable: this.isPinnable || true
  };

  getColorScale(domain, numBins = 5, color = "Reds") {
    let scaleDomain = [0,25,50,75,100]
    if(domain.length > numBins) {
      scaleDomain = ckmeans(domain, numBins)
    }
    return d3scale
      .scaleThreshold()
      .domain(scaleDomain)
      .range(getColorRange(numBins, color));
  }

  RenderComponent = GISDatasetRenderComponent;
}

const GISDatasetLayerFactory = (options = {}) => new GISDatasetLayer(options);
export default GISDatasetLayerFactory;
