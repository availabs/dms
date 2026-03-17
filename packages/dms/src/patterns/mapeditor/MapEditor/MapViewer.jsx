import React from "react"
import { get } from 'lodash-es'
import { AvlMap as AvlMap2 } from "../../../ui/components/map"
import SymbologyViewLayer from './components/SymbologyViewLayer'
import PluginLayer from './components/PluginLayer'

import { PLUGIN_TYPE, MAP_STYLES } from "./"

import { MapEditorContext } from "../context"

// import LegendPanel from "./components/LayerManager/LegendPanel"
import MapViewerLegend from "./components/MapViewerLegend"

import { useImmer } from 'use-immer';

import { extractState, fetchBoundsForFilter } from './stateUtils';

import {
  SourceAttributes,
  ViewAttributes,
  getAttributes,
  DamaSymbologyAttributes
} from "../attributes";

export const SymbologyContext = React.createContext(undefined);

const DEFAULT_BLANK_SYMBOLOGY = {
  name: '',
  description: '',
  symbology: {
    dmsSymbology: true,
    layers: {},
    plugins: {},
    pluginData: {}
  },
};

const MapViewer = props => {

// console.log("MapViewer::props", props);

  const mounted = React.useRef(false);

  const { falcor, falcorCache, pgEnv } = React.useContext(MapEditorContext);
  const { id: symbologyId } = props.params;

  React.useEffect(() => {
    if (symbologyId) {
      falcor.get([
        "dama", pgEnv, "symbologies", "byId", symbologyId,
        "attributes", Object.values(DamaSymbologyAttributes)
      ]);
    }
  }, [falcor, symbologyId, pgEnv]);

  React.useEffect(() => {
    const symbologyLengthPath = ["dama", pgEnv, "symbologies", "length"];

    falcor.get(symbologyLengthPath)
      .then(res => {
        const length = get(res.json, symbologyLengthPath, 0);
        if (length) {
          falcor.get([
            "dama", pgEnv, "symbologies",
            "byIndex", { from: 0, to: length - 1 },
            "attributes", DamaSymbologyAttributes
          ]);
        }
      });
  }, [falcor, pgEnv]);

  const damaSymbologies = React.useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "symbologies", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]))
      .filter(v => Object.keys(v).length > 0)
      .map(sym => ({
        ...sym,
        id: sym.symbology_id,
        symbology: {
          ...sym.symbology,
          isDamaSymbology: true
        }
      }));
  }, [falcorCache, pgEnv]);

  const dmsSymbologies = React.useMemo(() => {
    return [...props.dataItems];
  }, [props.dataIems]);

  const symbologies = React.useMemo(() => {
    return [...dmsSymbologies, ...damaSymbologies];
  }, [damaSymbologies, dmsSymbologies]);

  const initialSymbology = React.useMemo(() => {
    return symbologies.find(s => s.id == symbologyId);
  }, [symbologyId, symbologies]);

  const [state, setState] = useImmer(initialSymbology || DEFAULT_BLANK_SYMBOLOGY);

  React.useEffect(() => {
  	if (initialSymbology && (initialSymbology.id !== state.id)) {
  		setState(initialSymbology);
  	}
  }, [initialSymbology, state]);

  let {
  	activeLayer,
    sourceId
  } = React.useMemo(() => {
    return extractState(state);
  }, [state]);

// console.log("MapViewer::sourceId", sourceId);

  React.useEffect(() => {
    //console.log('getmetadat', sourceId)
    if (sourceId) {
      falcor.get([
          "dama", pgEnv, "sources", "byId", sourceId, "attributes", Object.values(SourceAttributes)
      ])//.then(res => console.log('source metadata res', sourceId, res));
    }
  }, [falcor, sourceId]);

  const [mapLayers, setMapLayers] = React.useState([]);

  React.useEffect(() => {
    if (mounted.current) {
      setMapLayers(draftMapLayers => {

        let currentLayerIds = draftMapLayers.map(d => d.id).filter(d => !!d);

        let newLayers = [
          ...Object.values(state?.symbology?.layers || {}),
          ...Object.values(state?.symbology?.plugins || {})
        ].filter(Boolean)
          .filter(d => !currentLayerIds.includes(d.id))
          .sort((a, b) => b.order - a.order)
          .map(l => {
            if(l.type === PLUGIN_TYPE) {
              return new PluginLayer(l);
            }
            else {
              return new SymbologyViewLayer(l);
            }
          });

        let oldLayers = draftMapLayers.filter(
          d =>
            Object.keys(state?.symbology?.layers || {}).includes(d.id) ||
            Object.keys(state?.symbology?.plugins || {}).includes(d.id)
        );

        const out = [
          // keep existing layers & filter
          ...oldLayers,
          // add new layers
          ...newLayers
        ]
        .sort((a, b) => state.symbology.layers[b?.id]?.order - state.symbology.layers[a?.id]?.order)

        return out;
      })
    }
  }, [
  		mounted.current,
  		state?.symbology?.layers,
      state?.symbology?.plugins
  	]
  );

  const layerProps = React.useMemo(() =>
    ({ ...state?.symbology?.layers,
    	...state?.symbology?.plugins,
      zoomToFit: state?.symbology?.zoomToFit,
      zoomToFilterBounds: state?.symbology?.zoomToFilterBounds } || {}
    ), [
    	state?.symbology?.layers,
    	state?.symbology?.plugins,
    	state?.symbology?.zoomToFit,
      state?.symbology?.zoomToFilterBounds
    ]
  );

// console.log("MapViewer::layerProps", layerProps);

  const SymbologyContextValue = React.useMemo(() => {
    return { state, setState, params: props.params };
  }, [state, props.params]);

  return (
    <SymbologyContext.Provider value={ SymbologyContextValue }>
      <div className="w-full h-full relative" ref={ mounted }>
        <AvlMap2
          layers={ mapLayers }
          layerProps={ layerProps }
          hideLoading={ true }
          showLayerSelect={ true }
          mapOptions={ {
            center: [-76, 43.3],
            zoom: 6,
            maxPitch: 60,
            // protocols: [PMTilesProtocol],

            styles: MAP_STYLES
          } }
          leftSidebar={ false }
          rightSidebar={ false }
        />
        <div className="absolute top-0 left-0">
        	<MapViewerLegend />
        </div>
      </div>
    </SymbologyContext.Provider>
  )
}

export default MapViewer;
