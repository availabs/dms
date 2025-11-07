import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Button,  getColorRange } from "~/modules/avl-components/src"
import get from 'lodash/get'
import isEqual from "lodash/isEqual"
import cloneDeep from 'lodash/cloneDeep'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import GISDatasetLayer from './Layer2'
import Symbology from './symbology'
// import { AvlMap } from "~/modules/avl-maplibre/src"
import { AvlMap, ThemeProvider} from "~/modules/avl-map-2/src"
import mapTheme from './map-theme'

import { DatasetsContext } from "../../../../context"
//import config from "~/config.json"
import { DAMA_HOST } from "~/config"
import {Protocol, PMTiles} from './utils/pmtiles'

// import {google_streets_style} from '~/config.json'

import { scaleThreshold, scaleOrdinal } from "d3-scale"
const ColorRange = getColorRange(7, "Reds")
const OrdinalColorRange = getColorRange(12, "Set3")

const PIN_OUTLINE_LAYER_SUFFIX = '_pin_outline'

const DEFAULT_MAP_STYLES = [
  { name: "Streets", style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9"},
  { name: "Light", style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9" },
  { name: "Dark", style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9" }
];

// import { SymbologyControls } from '~/pages/DataManager/components/SymbologyControls'
//import { DAMA_HOST } from "~/config"

const getTilehost = (DAMA_HOST) =>
  DAMA_HOST === "http://localhost:3369"
    ? "http://localhost:3370"
    : DAMA_HOST + "/tiles";

const TILEHOST = getTilehost(DAMA_HOST)

const ViewSelector = ({views}) => {
  const { viewId, sourceId, page } = useParams()
  const navigate = useNavigate()
  const {baseUrl} = React.useContext(DatasetsContext)

  return (
    <div className='flex'>
      <div className='py-3.5 px-2 text-sm text-gray-400'>Version : </div>
      <div className='flex-1'>
        <select
          className="pl-3 pr-4 py-2.5 border border-blue-100 bg-blue-50 w-full bg-white mr-2 flex items-center justify-between text-sm"
          value={viewId}
          onChange={(e) => navigate(`${baseUrl}/source/${sourceId}/${page}/${e.target.value}`)}
        >
          {views
            .sort((a,b) => b.view_id - a.view_id)
            .map((v,i) => (
            <option key={i} className="ml-2  truncate" value={v.view_id}>
              {v.version ? v.version : v.view_id}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}


const MapPage = ({params, source,views, HoverComp, showViewSelector=true, displayPinnedGeomBorder=false, mapStyles }) => {
  const [searchParams] = useSearchParams();
  const urlVariable = searchParams.get("variable")

  const {view_id: viewId } = params;
  const { pgEnv, baseUrl, user } = React.useContext(DatasetsContext);
  //const { falcor } = useFalcor()
  const [ editing, setEditing ] = React.useState(null)
  //const [ activeVar, setActiveVar] = React.useState(null)

  // console.log("\n\n\n\n\n");
  // console.log("what is the content of the filters data: ", filters);
  // console.log("\n\n\n\n\n");
  const coalescedViewId = urlVariable && !viewId ? urlVariable : viewId; //TODO ryan this  could ahve some breaking changes elsewhere

  const activeView = React.useMemo(() => {
    let currentView = (views || []).filter(
      (d) => d.view_id === +coalescedViewId
    );
    return get(currentView, "[0]", views[0]);
  }, [views, coalescedViewId]);

  const mapData = useMemo(() => {
    let out = get(activeView,`metadata.tiles`,{sources:[], layers:[]})
    out?.sources?.forEach(s => {
      if(s?.source?.url) {
        s.source.url = s.source.url.replace('$HOST', TILEHOST)
        s.source.url += '?cols=ogc_fid'
        if(s.source.url.includes('.pmtiles')){
          s.source.url = s.source.url
            .replace('https://', 'pmtiles://')
            .replace('http://', 'pmtiles://')
        }
      }
    })
    return out
  }, [activeView])

  const metaData = useMemo(() => {
    let out = get(activeView,`metadata`,{tiles:{sources:[], layers:[]}})
    get(out,'tiles.sources',[])
      .forEach(s => {
        if(s?.source?.url) {
          //console.log('hola', s?.source?.url)
          s.source.url = s.source.url.replace('$HOST', TILEHOST)
        }
      })
    return out
  }, [activeView])
  const activeViewId = React.useMemo(() => get(activeView,`view_id`,null), [activeView])

  const [ tempSymbology, setTempSymbology] = React.useState(get(mapData,'symbology',{}));

  const { sources: symSources, layers: symLayers } = tempSymbology;

  //console.log("Symbology:", tempSymbology)

  const layer = React.useMemo(() => {
      const sources = symSources || get(mapData,'sources',[]);
      const layers =  symLayers || get(mapData,'layers',[]);
      if(sources.length === 0 || layers.length === 0 ) {
        return null
      }
      //console.log('testing',  get(source, ['metadata', 'columns'], get(source, 'metadata', [])))
      let attributes = (get(source, ['metadata', 'columns'], get(source, 'metadata', [])) || [])
      attributes = Array.isArray(attributes) ? attributes : []

      if(displayPinnedGeomBorder){
        if (!layers.find((layer) => layer.id.includes(PIN_OUTLINE_LAYER_SUFFIX))) {
          const layerId = layers?.[0]?.id;
          const pinnedGeomLayer = {
            id: layerId + PIN_OUTLINE_LAYER_SUFFIX,
            type: "line",
            paint: {
              "line-color": "black",
              "line-width": 3,
              "line-opacity": 0,
            },
            "line-color": "black",
            "line-opacity": 0,
            "line-width": 3,
            source: layers?.[0]?.source,
            "source-layer": layerId,
          };
          layers.push(pinnedGeomLayer);
        }
      }



      if(sources?.[0]?.source?.tiles?.[0] && !sources[0].source.tiles[0].includes('?') ) {
        
        sources[0].source.tiles[0] = sources[0].source.tiles[0] + '?cols=ogc_fid'
      }
      //console.log('sources after', sources[0].source.tiles[0])
      

      return {
            name: source.name,
            pgEnv,
            source: source,
            activeView: activeView,
            hoverComp: HoverComp?.Component || false,
            isPinnable: HoverComp?.isPinnable || false,
            attributes,
            activeViewId: activeViewId,
            sources,
            layers,
            symbology: get(mapData, `symbology`, {})//{... get(mapData, `symbology`, {}), ...tempSymbology}
      }
      // add tempSymbology as depen
  },[source, views, mapData, activeViewId, symSources, symLayers, displayPinnedGeomBorder])


  return (
    <div>
      <div className='w-full h-[900px]'>
        <Map
          key={ viewId }
          layers={ [layer] }
          layer={layer}
          source={ source }
          tempSymbology={ tempSymbology }
          setTempSymbology={ setTempSymbology }
          mapStyles={mapStyles}/>
      </div>

      {user.authLevel >= 5 ?
      <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
        <dl className="sm:divide-y sm:divide-gray-200">
          {['sources','layers']
            .map((attr,i) => {
              let val = JSON.stringify(get(layer,attr,[]),null,3)
              return (
                <div key={i} className='flex justify-between group'>
                  <div  className="flex-1 sm:grid sm:grid-cols-5 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500 py-5">{attr}</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-4">
                      {editing === attr ?
                        <div className='pt-3 pr-8'>
                          <Edit
                            startValue={val}
                            attr={attr}
                            viewId={activeViewId}
                            parentData={get(activeView,`metadata`,{tiles:{}})}
                            cancel={() => setEditing(null)}
                          />
                        </div> :
                        <div className='py-3 pl-2 pr-8'>
                          <pre className='bg-gray-100 tracking-tighter overflow-auto scrollbar-xs'>
                            {val}
                          </pre>
                        </div>
                      }
                    </dd>
                  </div>

                  <div className='hidden group-hover:block text-blue-500 cursor-pointer' onClick={e => editing === attr ? setEditing(null): setEditing(attr)}>
                    <i className="fad fa-pencil absolute -ml-12 mt-3 p-2.5 rounded hover:bg-blue-500 hover:text-white "/>
                  </div>
                </div>
              )
            })
          }
        </dl>
      </div> : ''}
    </div>
  )
}

export default MapPage

const PMTilesProtocol = {
  type: "pmtiles",
  protocolInit: maplibre => {
    const protocol = new Protocol();
    maplibre.addProtocol("pmtiles", protocol.tile);
    return protocol;
  },
  sourceInit: (protocol, source, maplibreMap) => {
    const p = new PMTiles(source.url);
    protocol.add(p);
  }
}

const Map = ({ layers, layer, tempSymbology, setTempSymbology, source,  mapStyles }) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  const {falcor} = React.useContext(DatasetsContext)
  const [layerData, setLayerData] = React.useState([])
  // const  currentLayerIds = React.useMemo(() => {
  //   return layers.filter(d => d).map(d => d.activeViewId)
  // },[layers])

  React.useEffect( () => {
    if (!mounted) return;

    setLayerData(l => {
      // use functional setState
      // to get info about previous layerData (l)
      let activeLayerIds = l?.map(d => d.activeViewId)?.filter(Boolean);
      //console.log('updatelayers', currentLayerIds, l, layers)

      let output = layers?.filter(Boolean)
          .filter(d => !activeLayerIds.includes(d.activeViewId))
          .map(l => GISDatasetLayer(l));

      //console.log('updatelayers2', output)

      return [
        // remove layers not in list anymore
        ...l?.filter(d => activeLayerIds.includes(d.activeViewId)),
        // add newly initialized layers
        ...output
      ]
    });
  }, [mounted, layers]);

  const styles = React.useMemo(() => {
    return mapStyles && mapStyles?.length > 0 ? mapStyles : DEFAULT_MAP_STYLES;
  }, [mapStyles]);

  const activeVar = 'none';
  const updateLegend = React.useCallback(legend => {
    if (!activeVar || (activeVar === "none")) return;
    // const { type, ...rest } = legend;

    const paths = layer.layers.map(({ id, type }) => {
      return [id, `${ type }-color`, activeVar];
    })

    const newSym = JSON.parse(JSON.stringify(tempSymbology));

  // console.log("updateLegend:", legend)

    paths.forEach(([id, pp, av]) => {
      newSym[id][pp][av].settings = {
        ...tempSymbology[id][pp][av].settings,
        ...legend
      }
    });

    setTempSymbology(newSym);

  }, [tempSymbology, setTempSymbology, layer, activeVar]);

  const layerProps = React.useMemo(()=>{
    let inputViewIds = layers.filter(Boolean).map(d => d.activeViewId)
    return layerData.reduce((out, cur) => {
      const index = inputViewIds.indexOf(cur.activeViewId);
      if (index !== -1) {
        out[cur.id] = cloneDeep(layers[index]);
        out[cur.id].symbology = cloneDeep(tempSymbology);
        out[cur.id].updateLegend = updateLegend;;
        out[cur.id].sourceId = source.source_id;
      }
      return out
    },{})
  },[layers, layerData, tempSymbology, updateLegend, source.source_id])

  //console.log('mapTheme',mapTheme)
  return (

      <div className='w-full h-full'>
        <ThemeProvider theme={mapTheme} >

          <AvlMap
            mapOptions={{
              protocols: [PMTilesProtocol],
              zoom: 7.3, //8.32/40.594/-74.093
              navigationControl: false,
              center: [-73.8, 40.79],
              styles: styles
            }}
            layers={ layerData }
            layerProps={ layerProps }
            leftSidebar={ false }
            rightSidebar={ false }
            mapActions={ ["navigation-controls"] }/>
        </ThemeProvider>
      </div>

  )
}





const Edit = ({startValue, attr, viewId, parentData, cancel=()=>{}}) => {
  const [value, setValue] = useState('')
  const { pgEnv, baseUrl, falcor } = React.useContext(DatasetsContext);
  const inputEl = useRef(null);

  useEffect(() => {
    setValue(startValue)
    inputEl.current.focus();
  },[startValue])

  useEffect(() => {
    inputEl.current.style.height = 'inherit';
    inputEl.current.style.height = `${inputEl.current.scrollHeight}px`;
  },[value])

  const save = async (attr, value) => {
    console.log('click save 222', attr, value, parentData)
    let update = JSON.parse(value)
    //console.log('update', value)
        let val = parentData || {tiles:{}}
        if(!val.tiles) {
          val.tiles = {}
        }
    //console.log('parentData', val )
        val.tiles[attr] = update
        // console.log('out value', update)
    if(viewId) {
      try{
        let response = await falcor.set({
            paths: [
              ['dama',pgEnv,'views','byId',viewId,'attributes', 'metadata' ]
            ],
            jsonGraph: {
              dama:{
                [pgEnv]:{
                  views: {
                    byId:{
                      [viewId] : {
                        attributes : {
                          metadata: JSON.stringify(val)
                        }
                      }
                    }
                  }
                }
              }
            }
        })
        console.log('set run response', response)
        cancel()
      } catch (error) {
        console.log('error stuff',error,value, parentData);
      }
    }
  }

  return (
    <div className='w-full'>
      <div className='w-full flex'>
        <textarea
          ref={inputEl}
          className='flex-1 px-2 shadow text-base bg-blue-100 focus:ring-blue-700 focus:border-blue-500  border-gray-300 rounded-none rounded-l-md'
          value={value}
          onChange={e => setValue(e.target.value)}
        />
      </div>
      <div>
        <Button themeOptions={{size:'sm', color: 'primary'}} onClick={e => save(attr,value)}> Save </Button>
        <Button themeOptions={{size:'sm', color: 'cancel'}} onClick={e => cancel()}> Cancel </Button>
      </div>
    </div>
  )
}
