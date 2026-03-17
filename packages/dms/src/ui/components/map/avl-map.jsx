import React from "react"

import { get } from "lodash-es"

import Icon from "../Icon"
import { ThemeContext } from "../../themeContext"
import { mapTheme as defaultMapTheme } from "./map.theme"
import { LayerRenderComponent } from "./avl-layer"
import { HoverComponent, PinnedHoverComponent } from "./components/HoverComponent"
import { useSetSize } from "./utils"

let idCounter = 0;
const getNewId = () => `avl-thing-${ ++idCounter }`;

const EmptyArray = [];
const EmptyObject = {};

const PIN_OUTLINE_LAYER_SUFFIX = 'pin_outline'

export const DefaultStyles = [
  { name: "Dark",
    style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9"
  },
  { name: "Light",
    style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9"
  },
  { name: "Streets",
    style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9",
  },
  { name: "Satellite Streets",
    style: "https://api.maptiler.com/maps/hybrid/style.json?key=mU28JQ6HchrQdneiq6k9",
  }
];

const DefaultMapOptions = {
  center: [-74.180647, 42.58],
  minZoom: 2,
  zoom: 10,
  preserveDrawingBuffer: true,
  styles: DefaultStyles,
  attributionControl: false,
  navigationControl: false,
  protocols: []
};

const ActionButton = ({ children, onClick }) => {
  return (
    <div onClick={ onClick }
      className="rounded bg-white h-10 w-10 flex items-center justify-center
        cursor-pointer pointer-events-auto hover:text-blue-500"
    >
      { children }
    </div>
  )
}

const MapAction = ({ action, icon, MapActions, mapIcons }) => {
  const onClick = React.useCallback(() => {
    if (typeof action === "function") {
      action(MapActions);
    }
  }, [action, MapActions]);
  return (
    <ActionButton onClick={ onClick }>
      <Icon icon={ icon || mapIcons.settingsIcon } className="size-5"/>
    </ActionButton>
  )
}

const ResetView = ({ MapActions, maplibreMap, mapIcons }) => {
  const [bearing, setBearing] = React.useState(0);

  React.useEffect(() => {
    if (!maplibreMap) return;
    setBearing(maplibreMap.getBearing());
  }, [maplibreMap]);

  React.useEffect(() => {
    if (!maplibreMap) return;
    const func = e => {
      setBearing(maplibreMap.getBearing());
    }
    maplibreMap.on("rotate", func);
    return () => {
      maplibreMap.off("rotate", func);
    }
  }, [maplibreMap]);

  const resetView = React.useCallback(e => {
    MapActions.resetView();
  }, [MapActions.resetView]);

  return (
    <ActionButton onClick={ resetView }>
      <div style={ { transform: `rotate(${ bearing }deg)` } }>
        <Icon icon={ mapIcons.compassIcon } className="size-5"/>
      </div>
    </ActionButton>
  )
}

const Navigationcontrols = ({ showLayerSelect, mapStyles, styleIndex, MapActions, maplibreMap, mapIcons }) => {
  const [bearing, setBearing] = React.useState(0);
  const [styleSelect, showStyleSelect] = React.useState(false)

  React.useEffect(() => {
    if (!maplibreMap) return;
    setBearing(maplibreMap.getBearing());
  }, [maplibreMap]);

  React.useEffect(() => {
    if (!maplibreMap) return;
    const func = e => {
      setBearing(maplibreMap.getBearing());
    }
    maplibreMap.on("rotate", func);
    return () => {
      maplibreMap.off("rotate", func);
    }
  }, [maplibreMap]);

  const zoomIn = React.useCallback(e => {
    if (!maplibreMap) return;
    const current = maplibreMap.getZoom();
    maplibreMap.zoomTo(current * 1.1);
  }, [maplibreMap]);

  const resetView = React.useCallback(e => {
    MapActions.resetView();
  }, [MapActions.resetView]);

  const zoomOut = React.useCallback(e => {
    if (!maplibreMap) return;
    const current = maplibreMap.getZoom();
    maplibreMap.zoomTo(current / 1.1);
  }, [maplibreMap]);

  return (
    <div className="flex flex-row cursor-pointer pointer-events-auto">
      { (showLayerSelect && (mapStyles && mapStyles.length > 1)) && (
        <div className='hover:bg-slate-100/50 h-10 w-10 flex items-center justify-center rounded relative'>
          <div className='border border-slate-400 rounded shadow' onClick={() => showStyleSelect(!styleSelect)}>
            <div className='w-8 h-8 rounded border bg-slate-400' />
          </div>
          <div className={`w-36 bg-slate-100 absolute bottom-10 right-0 rounded ${styleSelect ? '' : 'hidden'}`}>
            {mapStyles.map((style,i) => (
              <div key={i} className='flex items-center p-1 hover:bg-blue-100' onClick={() => {
                showStyleSelect(false);
                MapActions.setMapStyle(i)
              }}>
                <div className='h-8 w-8 flex items-center justify-center'>
                  <Icon icon={ mapIcons.mapStyleIcon } className="size-5 text-slate-500"/>
                </div>
                <div className='text-sm px-2'>{style.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div onClick={ zoomOut } className='hover:bg-slate-100/50 h-10 w-10 flex items-center justify-center rounded text-slate-600 hover:text-blue-500'>
        <Icon icon={ mapIcons.zoomOutIcon } className="size-5"/>
      </div>

      <div onClick={ zoomIn } className='hover:bg-slate-100/50 h-10 w-10 flex items-center justify-center rounded text-slate-600 hover:text-blue-500'>
        <Icon icon={ mapIcons.zoomInIcon } className="size-5"/>
      </div>

      <div className='hover:bg-slate-100/50 h-10 w-10 flex items-center justify-center rounded text-slate-600 hover:text-blue-500'>
        <div onClick={ resetView }>
          <div style={ { transform: `rotate(${ bearing - 45 }deg)` } }>
            <Icon icon={ mapIcons.compassIcon } className="size-5"/>
          </div>
        </div>
      </div>
    </div>
  )
}

const LayerAction = ({ action, icon, layer, MapActions, mapIcons }) => {
  const onClick = React.useCallback(() => {
    if (typeof action === "function") {
      action(layer, MapActions);
    }
  }, [action, layer, MapActions]);
  return (
    <ActionButton onClick={ onClick }>
      <Icon icon={ icon || mapIcons?.settingsIcon || "Settings" } className="size-5"/>
    </ActionButton>
  )
}

const DefaultMapActions = {
  "reset-view": {
    Component: ResetView
  },
  "go-home": {
    Component: MapAction,
    icon: "Home",
    action: ({ goHome }) => {
      goHome();
    }
  },
  "navigation-controls": {
    Component: Navigationcontrols
  }
}

const LoadingIndicator = ({ layer, mapIcons }) => {
  const {
    icon = mapIcons?.loadingIcon || "Spinner",
    color = "text-blue-500"
  } = layer.loadingIndicator || {};
  return (
    <div className="w-fit flex items-center rounded-l bg-white p-2"
      style={ {
        borderTopRightRadius: "2rem",
        borderBottomRightRadius: "2rem",
        minWidth: "16rem"
      } }
    >
      <div className="flex-1 font-bold mr-4">
        { layer.name }
      </div>
      <div className={ `flex items-center ${ color }` }>
        <Icon icon={ icon } className="size-8 animate-spin"/>
      </div>
    </div>
  )
}

const InitialState = {
  maplibreMap: null,
  moving: false,
  mapStyles: [],
  styleIndex: 0,
  layerVisibility: {},
  layerState: {},
  dynamicLayers: [],
  activeLayers: {},
  resourcesLoaded: {},
  hoverData: {
    data: [],
    lngLat: { lng: 0, lat: 0 },
    hovering: false
  },
  pinnedHoverComps: [],
  pinnedHoverCompIds: [],
  filterUpdate: { layerId: null },
  layersLoading: {},
  legend: {
    type: "quantize",
    domain: [0, 1],
    range: ["red", "yellow", "green"],
    format: ",.2f",
    name: "Unnamed Legend",
    isActive: false
  },
  Protocols: {},
  initializedLayers: []
}

const Reducer = (state, action) => {
  const { type, ...payload } = action;
  switch (type) {
    case "toggle-layer-visibility":
      return {
        ...state,
        layerVisibility: {
          ...state.layerVisibility,
          [payload.layerId]: !state.layerVisibility[payload.layerId]
        }
      }
    case "update-layer-state": {
      const { layerId, layerState: newState } = payload;
      const prevState = get(state, ["layerState", layerId], {});
      if (typeof newState === "function") {
        return {
          ...state,
          layerState: {
            ...state.layerState,
            [layerId]: {
              ...prevState,
              ...newState(prevState)
            }
          }
        }
      }
      return {
        ...state,
        layerState: {
          ...state.layerState,
          [layerId]: {
            ...prevState,
            ...newState
          }
        }
      }
    }

    case "create-dynamic-layer": {
      const { layer } = payload;
      const exists = state.dynamicLayers.reduce((a, c) => {
        return a || (c.id === layer.id);
      }, false);
      if (exists) return state;
      layer.isDynamic = true;
      return {
        ...state,
        dynamicLayers: [...state.dynamicLayers, layer]
      }
    }
    case "destroy-dynamic-layer":
      return {
        ...state,
        dynamicLayers: state.dynamicLayers.filter(dl => dl.id !== payload.layerId)
      }

    case "update-filter": {
      return {
        ...state,
        filterUpdate: {
          ...payload
        }
      }
    }

    case "hover-layer-move": {
      const { data, layer, layerId, Component, isPinnable, zIndex, ...rest } = payload;
      return {
        ...state,
        hoverData: {
          data: [
            ...state.hoverData.data.filter(d => d.layerId !== layerId),
            { data,
              Component,
              layer,
              layerId,
              isPinnable,
              zIndex,
            }
          ],
          ...rest,
          hovering: true
        },
      };
    }
    case "hover-layer-leave": {
      const { layerId } = payload;
      const data = state.hoverData.data.filter(d => d.layerId !== layerId);
      return {
        ...state,
        hoverData: {
          ...state.hoverData,
          data,
          hovering: Boolean(data.length)
        },
      };
    }
    case "pin-hover-comp": {
      if (!state.hoverData.hovering) return state;

      const { lngLat, marker } = payload;

      const HoverComps = [...state.hoverData.data]
        .filter(({ layerId }) => !layerId.includes(PIN_OUTLINE_LAYER_SUFFIX))
        .filter(({ isPinnable }) => isPinnable)
        .sort((a, b) => b.zIndex - a.zIndex);

      if (HoverComps.length) {
        marker.addTo(state.maplibreMap);
        const newPinned = {
          id: getNewId(),
          lngLat,
          marker,
          HoverComps
        }

        const updatedPinnedComps = [
        ...state.pinnedHoverComps,
        newPinned
      ];

      const curGeometry = updatedPinnedComps[0]?.HoverComps[0]?.layer?.filters?.geometry?.value;

      const pinnedCompIds = updatedPinnedComps.map((pinnedComp) => {
        const activeGeoComp = pinnedComp.HoverComps.length > 1 ? pinnedComp.HoverComps.find((hoverComp) =>
          hoverComp.data[1].includes(curGeometry)
        ) : pinnedComp.HoverComps[0];

        return activeGeoComp?.data[2];
      }).filter(id => id !== undefined);

        return {
          ...state,
          pinnedHoverCompIds: pinnedCompIds,
          pinnedHoverComps: updatedPinnedComps
        };
      }
      return state;
    }
    case "remove-pinned": {
      const pinnedIdsToRemove = [];
      state.pinnedHoverComps.forEach(phc => {
        if (phc.id !== payload.id) { return }
        const dataId = phc.HoverComps[0].data[0]
        pinnedIdsToRemove.push(dataId);
      })

      return {
        ...state,
        pinnedHoverComps: state.pinnedHoverComps.filter(phc => {
          if (phc.id !== payload.id) return true;
          phc.marker.remove();
          return false;
        }),
        pinnedHoverCompIds: state.pinnedHoverCompIds.filter(pinnedId => {
          if (!pinnedIdsToRemove.includes(pinnedId.ogc_fid)) return true;
          return false;
        }),
      };
    }

    case "layer-loading-start": {
      const { layerId } = payload;
      let start = get(state, ["layersLoading", layerId, "start"], 0);
      let loading = get(state, ["layersLoading", layerId, "loading"], 0);
      return {
        ...state,
        layersLoading: {
          ...state.layersLoading,
          [layerId]: {
            start: start || performance.now(),
            loading: ++loading
          }
        }
      }
    }
    case "layer-loading-stop": {
      const { layerId } = payload;
      let start = get(state, ["layersLoading", layerId, "start"], 0);
      let loading = get(state, ["layersLoading", layerId, "loading"], 0);
      return {
        ...state,
        layersLoading: {
          ...state.layersLoading,
          [layerId]: {
            start: loading > 1 ? start : 0,
            loading: Math.max(--loading, 0)
          }
        }
      }
    }

    case "activate-layer":
      return {
        ...state,
        activeLayers: {
          ...state.activeLayers,
          [payload.layerId]: true
        }
      }
    case "deactivate-layer":
      return {
        ...state,
        activeLayers: {
          ...state.activeLayers,
          [payload.layerId]: false
        }
      }

    case "update-legend":
      return {
        ...state,
        legend: {
          ...state.legend,
          ...payload.update
        }
      }

    case "set-resources-loaded": {
      const { layerId, loaded } = payload;
      return {
        ...state,
        resourcesLoaded: {
          ...state.resourcesLoaded,
          [layerId]: loaded
        }
      }
    }

    case "initialize-layers": {
      const {
        layerVisibility,
        layerState,
        activeLayers,
        resourcesLoaded,
        initializedLayers
      } = payload;
      return {
        ...state,
        initializedLayers: [
          ...state.initializedLayers,
          ...initializedLayers
        ],
        layerVisibility: {
          ...state.layerVisibility,
          ...layerVisibility
        },
        layerState: {
          ...state.layerState,
          ...layerState
        },
        activeLayers: {
          ...state.activeLayers,
          ...activeLayers
        },
        resourcesLoaded: {
          ...state.resourcesLoaded,
          ...resourcesLoaded
        }
      }
    }

    case "update-state":
      return { ...state, ...payload };

    case "map-loaded": {
      const { legend, ...rest } = payload;
      return {
        ...state,
        ...rest,
        initializedLayers: [],
        legend: {
          ...state.legend,
          ...legend
        }
      };
    }
    case "map-removed":
      return { ...InitialState };
    default:
      return state;
  }
}

const AvlMapInner = ({
  maplibre,
  mapOptions = EmptyObject,
  id,
  layers = EmptyArray,
  layerProps = EmptyObject,
  legend = EmptyObject,
  styleIndex = 0,
  showLayerSelect = false,
  mapActions = ["navigation-controls"],
  ...props
}) => {

  const MapOptions = React.useRef({
    containerId: id || getNewId(),
    ...DefaultMapOptions,
    ...mapOptions,
    legend
  });

  const [state, dispatch] = React.useReducer(Reducer, InitialState);

// INITIALIZE MAP
  React.useEffect(() => {
    const {
      styles,
      navigationControl,
      legend,
      protocols = [],
      containerId,
      ...Options
    } = MapOptions.current;

    const Protocols = protocols.reduce((a, c) => {
      const { type, protocolInit, ...rest } = c;
      a[type] = {
        ...rest,
        Protocol: protocolInit(maplibre)
      }
      return a;
    }, {});

    const maplibreMap = new maplibre.Map({
      container: containerId,
      ...Options,
      style: styles[0].style
    });

    if (navigationControl) {
      maplibreMap.addControl(new maplibre.NavigationControl(), navigationControl);
    }

    maplibreMap.on("move", e => {
      dispatch({ type: "update-state", moving: true });
    });
    maplibreMap.on("moveend", e => {
      dispatch({ type: "update-state", moving: false });
    });

    maplibreMap.once("load", e => {
      dispatch({
        type: "map-loaded",
        maplibreMap,
        mapStyles: styles,
        styleIndex,
        legend,
        Protocols
      });
    });

    return () => {
      dispatch({ type: "map-removed" })
      maplibreMap.remove();
    };
  }, []);

// INITIALIZE LAYERS
  React.useEffect(() => {
    if (!state.maplibreMap) return;

    const allLayers = [...layers, ...state.dynamicLayers];

    const needsInitializing = allLayers.filter(l => {
      return !state.initializedLayers.includes(l);
    });

    if (needsInitializing.length) {

      const layerVisibility = {};
      const layerState = {};
      const activeLayers = {};
      const resourcesLoaded = {};

      needsInitializing.forEach(l => {
        layerVisibility[l.id] = get(l, "startVisible", true);
        layerState[l.id] = get(l, "startState", {});
        activeLayers[l.id] = get(l, "startActive", true);
        resourcesLoaded[l.id] = false;
        function updateState(layerState) {
          dispatch({
            type: "update-layer-state",
            layerId: l.id,
            layerState
          })
        }
        l.updateState = updateState.bind(l);
      });
      dispatch({
        type: "initialize-layers",
        layerVisibility,
        layerState,
        activeLayers,
        resourcesLoaded,
        initializedLayers: needsInitializing
      });
    }
  }, [state.maplibreMap, layers, state.dynamicLayers, state.initializedLayers]);

// SEND PROPS TO LAYERS
  React.useEffect(() => {
    layers.forEach(l => {
      l.props = get(layerProps, l.id, {});
    })
  }, [layers, layerProps, state.pinnedHoverCompIds]);

// SEND STATE TO LAYERS
  React.useEffect(() => {
    layers.forEach(l => {
      l.state = get(state, ["layerState", l.id], {});
      l.state = {...l.state, pinnedHoverCompIds: state.pinnedHoverCompIds}
    })
  }, [layers, state.layerState, state.pinnedHoverCompIds]);

// CREATE MAP ACTIONS
  const createDynamicLayer = React.useCallback(layer => {
    dispatch({ type: "create-dynamic-layer", layer })
  }, []);
  const destroyDynamicLayer = React.useCallback(layerId => {
    dispatch({ type: "destroy-dynamic-layer", layerId })
  }, []);

  const setResourcesLoaded = React.useCallback((layerId, loaded) => {
    dispatch({ type: "set-resources-loaded", layerId, loaded })
  }, []);

  const toggleLayerVisibility = React.useCallback(layerId => {
    dispatch({ type: "toggle-layer-visibility", layerId });
  }, []);

  const updateLayerState = React.useCallback((layerId, layerState) => {
    dispatch({ type: "update-layer-state", layerId, layerState });
  }, []);

  const setMapStyle = React.useCallback(styleIndex => {
    if (!state.maplibreMap) return;
    if (styleIndex === state.styleIndex) return;
    const mapStyle = state.mapStyles[styleIndex];
    if (!mapStyle) return;
    state.maplibreMap.once("styledata", e => {
      dispatch({ type: "update-state", styleIndex })
    });
    state.maplibreMap.setStyle(mapStyle.style);
  }, [state.maplibreMap, state.mapStyles, state.styleIndex]);

  const updateLegend = React.useCallback(update => {
    dispatch({ type: "update-legend", update })
  }, []);

  const updateHover = React.useCallback(hoverData => {
    dispatch(hoverData);
  }, []);

  const maplibreRef = React.useRef(maplibre);
  maplibreRef.current = maplibre;

  const pinHoverComp = React.useCallback(({ lngLat }) => {
    const marker = new maplibreRef.current.Marker().setLngLat(lngLat);
    dispatch({ type: "pin-hover-comp", lngLat, marker });
  }, []);

  const removePinnedHoverComp = React.useCallback(id => {
    dispatch({ type: "remove-pinned", id });
  }, []);

  const startLayerLoading = React.useCallback(layerId => {
    dispatch({ type: "layer-loading-start", layerId })
  }, []);
  const stopLayerLoading = React.useCallback(layerId => {
    dispatch({ type: "layer-loading-stop", layerId })
  }, []);

  const updateFilter = React.useCallback((layer, filterId, value) => {
    if (!get(layer, ["filters", filterId], null)) return;
    const prevValue = layer.filters[filterId].value;
    dispatch({ type: "update-filter", layerId: layer.id, filterId, prevValue, value })
  }, []);

  const activateLayer = React.useCallback(layerId => {
    dispatch({ type: "activate-layer", layerId });
  }, []);
  const deactivateLayer = React.useCallback(layerId => {
    dispatch({ type: "deactivate-layer", layerId });
  }, []);

  const goHome = React.useCallback(() => {
    if (!state.maplibreMap) return;
    const { center, zoom } = MapOptions.current;
    state.maplibreMap.easeTo({ pitch: 0, bearing: 0, center, zoom });
  }, [state.maplibreMap]);

  const resetView = React.useCallback((options = {}) => {
    if (!state.maplibreMap) return;
    state.maplibreMap.easeTo({ pitch: 0, bearing: 0, ...options });
  }, [state.maplibreMap]);

// DETERMINE ACTIVE AND INACTIVE LAYERS
  const [activeLayers, inactiveLayers] = React.useMemo(() => {
    return [...layers, ...state.dynamicLayers].reduce((a, c) => {
      if (state.activeLayers[c.id] && state.initializedLayers.includes(c)) {
        a[0].push(c);
      }
      else {
        a[1].push(c);
      }
      return a;
    }, [[], []]);
  }, [layers, state.dynamicLayers, state.activeLayers, state.initializedLayers]);

// APPLY POINTER STYLE TO CURSOR ON HOVER
  React.useEffect(() => {
    if (!state.maplibreMap) return;
    if (state.hoverData.hovering) {
      state.maplibreMap.getCanvas().style.cursor = 'pointer';
    }
    else {
      state.maplibreMap.getCanvas().style.cursor = '';
    }
  }, [state.maplibreMap, state.hoverData.hovering]);

// DETERMINE LOADING LAYERS
  const loadingLayers = React.useMemo(() => {
    return activeLayers.filter(layer => {
      return get(state, ["layersLoading", layer.id, "loading"], 0);
    }).sort((a, b) => {
      const aStart = get(state, ["layersLoading", a.id, "start"], 0);
      const bStart = get(state, ["layersLoading", b.id, "start"], 0);
      return aStart - bStart;
    })
  }, [state.layersLoading, activeLayers]);

// APPLY CLICK LISTENER TO MAP TO ALLOW PINNED HOVER COMPS
  const isPinnable = React.useMemo(() => {
    return activeLayers.reduce((a, c) => {
      return a || get(c, ["onHover", "isPinnable"], false);
    }, false);
  }, [activeLayers]);

  React.useEffect(() => {
    if (!isPinnable) return;

    state.maplibreMap.on("click", pinHoverComp);

    return () => { state.maplibreMap.off("click", pinHoverComp); }
  }, [state.maplibreMap, pinHoverComp, isPinnable]);

// GET HOVER COMP DATA
  const { HoverComps, ...hoverData } = React.useMemo(() => {
    if (!state.maplibreMap) {
      return { hovering: false };
    };
    const { data, ...rest } = state.hoverData;
    const HoverComps = [...data].sort(
      (a, b) => b.zIndex - a.zIndex
    );
    return { HoverComps, ...rest };
  }, [state.hoverData]);

// GET LAYER AND MAP ACTIONS
  const Actions = React.useMemo(() => {
    const mas = (mapActions || []).reduce((a, c) => {
      if (c in DefaultMapActions) {
        a.push(DefaultMapActions[c]);
      }
      else if (typeof c === "object") {
        a.push({
          Component: MapAction,
          icon: "Settings",
          ...c
        });
      }
      return a;
    }, []);
    return activeLayers.reduce((a, c) => {
      get(c, "layerActions", [])
        .forEach(({ Component = LayerAction, wrapper = null, ...action }) => {
          a.push({
            layer: c,
            Component: wrapper ? wrapper(Component) : Component,
            ...action
          });
        })
      return a;
    }, mas);
  }, [mapActions, activeLayers]);

  const projectLngLat = React.useCallback(lngLat => {
    if (!state.maplibreMap) return { x: 0, y: 0 };
    return state.maplibreMap.project(lngLat);
  }, [state.maplibreMap]);

  const [ref, setRef] = React.useState(null);
  const size = useSetSize(ref);

  const MapActions = React.useMemo(() => {
    return {
      toggleLayerVisibility,
      updateLayerState,
      activateLayer,
      deactivateLayer,
      updateFilter,
      startLayerLoading,
      stopLayerLoading,
      setMapStyle,
      setResourcesLoaded,
      updateLegend,
      createDynamicLayer,
      destroyDynamicLayer,
      resetView,
      goHome
    }
  }, [toggleLayerVisibility, updateLayerState,
      activateLayer, deactivateLayer, updateFilter,
      startLayerLoading, stopLayerLoading,
      setMapStyle, setResourcesLoaded, updateLegend,
      createDynamicLayer, destroyDynamicLayer,
      resetView, goHome
  ]);

  const { current: { containerId } } = MapOptions;

  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const mapIcons = { ...defaultMapTheme, ...themeFromContext?.map };

  return (
    <div className="block relative w-full h-full max-w-full max-h-full overflow-visible text-gray-800">
      <div ref={ setRef } id={ containerId } className="w-full h-full relative"/>

      <div id={ `${ containerId }-box-select-blocker` }
         className="absolute inset-0 z-50 pointer-events-none"/>

      <div className="flex absolute inset-0 pointer-events-none p-2">

        <div className="flex-1 relative">
          { [...activeLayers].reverse().map((l, i) => (
              <LayerRenderComponent key={ l.id }
                layer={ l }
                legend={ state.legend }
                isActive={ get(state, ["activeLayers", l.id], true) }
                isVisible={ get(state, ["layerVisibility", l.id], true) }
                isLoading={ Boolean(get(state, ["layersLoading", l.id, "loading"], false)) }
                resourcesLoaded={ Boolean(get(state, ["resourcesLoaded", l.id], false)) }
                maplibreMap={ state.maplibreMap }
                updateHover={ updateHover }
                containerId={ containerId }
                MapActions={ MapActions }
                activeLayers={ activeLayers }
                inactiveLayers={ inactiveLayers }
                layerProps={ get(layerProps, l.id, {}) }
                layerState={ get(state, ["layerState", l.id], {}) }
                allLayerProps={ layerProps }
                allLayerState={ state.layerState }
                styleIndex={ state.styleIndex }
                mapStyles={ state.mapStyles }
                layersLoading={ state.layersLoading }
                loadingLayers={ loadingLayers }
                filterUpdate={ state.filterUpdate }
                Protocols={ state.Protocols }/>
            ))
          }
          <div className="absolute bottom-0 left-0 grid grid-cols-1 gap-4">
            { !props.hideLoading && loadingLayers.map(layer => (
                <LoadingIndicator key={ layer.id } layer={ layer } mapIcons={ mapIcons }/>
              ))
            }
          </div>
        </div>

        { !Actions.length ? null :
          <div className="relative pl-4">
            <div className="flex flex-col h-full justify-end flex-end">
              { Actions.map(({ Component, ...action }, i) => (
                  <Component key={ i } { ...action }
                    mapIcons={ mapIcons }
                    legend={ state.legend }
                    maplibreMap={ state.maplibreMap }
                    MapActions={ MapActions }
                    activeLayers={ activeLayers }
                    inactiveLayers={ inactiveLayers }
                    mapStyles={ state.mapStyles }
                    styleIndex={ state.styleIndex }
                    showLayerSelect={ showLayerSelect }
                    layerVisibility={ state.layerVisibility }
                    layerProps={ layerProps }
                    layerState={ state.layerState }
                    filterUpdate={ state.filterUpdate }
                    hideLoading = {props.hideLoading}
                    layersLoading={ state.layersLoading }
                    loadingLayers={ loadingLayers }
                    resourcesLoaded={ state.resourcesLoaded }/>
                ))
              }
            </div>
          </div>
        }

      </div>

      { state.pinnedHoverComps.map(({ HoverComps, data, id, ...hoverData }) => (
          <PinnedHoverComponent { ...hoverData } { ...size }
            remove={ removePinnedHoverComp }
            project={ projectLngLat }
            id={ id } key={ id }
          >
            { HoverComps.map(({ Component, data, layer, layerId }) => (
                <Component key={ layerId } isPinned
                  legend={ state.legend }
                  layer={ layer }
                  data={ data }
                  maplibreMap={ state.maplibreMap }
                  MapActions={ MapActions }
                  activeLayers={ activeLayers }
                  inactiveLayers={ inactiveLayers }
                  mapStyles={ state.mapStyles }
                  styleIndex={ state.styleIndex }
                  layerVisibility={ state.layerVisibility }
                  layerProps={ layerProps }
                  layerState={ state.layerState }
                  filterUpdate={ state.filterUpdate }
                  layersLoading={ state.layersLoading }
                  loadingLayers={ loadingLayers }
                  resourcesLoaded={ state.resourcesLoaded }/>
              ))
            }
          </PinnedHoverComponent>
        ))
      }

      { !hoverData.hovering ? null :
        <HoverComponent { ...hoverData } { ...size } project={ projectLngLat }>
          { HoverComps.filter(({ layerId }) => !layerId.includes(PIN_OUTLINE_LAYER_SUFFIX)).map(({ Component, layerId, ...rest }) =>
              <Component key={ layerId } { ...rest }
                legend={ state.legend }
                maplibreMap={ state.maplibreMap }
                MapActions={ MapActions }
                activeLayers={ activeLayers }
                inactiveLayers={ inactiveLayers }
                mapStyles={ state.mapStyles }
                styleIndex={ state.styleIndex }
                layerVisibility={ state.layerVisibility }
                layerProps={ layerProps }
                layerState={ state.layerState }
                filterUpdate={ state.filterUpdate }
                layersLoading={ state.layersLoading }
                loadingLayers={ loadingLayers }
                resourcesLoaded={ state.resourcesLoaded }/>
            )
          }
        </HoverComponent>
      }

    </div>
  )
}

const AvlMap = (props) => {
  const [maplibreModule, setMaplibreModule] = React.useState(null);

  React.useEffect(() => {
    import("maplibre-gl").then(m => setMaplibreModule(() => m.default || m));
  }, []);

  if (!maplibreModule) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Icon icon="Spinner" className="size-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return <AvlMapInner { ...props } maplibre={ maplibreModule } />;
};

export { AvlMap };
