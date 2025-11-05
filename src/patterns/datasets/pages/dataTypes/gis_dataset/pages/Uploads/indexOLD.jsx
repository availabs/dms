import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Button,  getColorRange } from "~/modules/avl-components/src"
import get from 'lodash/get'
import cloneDeep from 'lodash/cloneDeep'
import { useParams, useNavigate } from 'react-router'
import GISDatasetLayer from './Layer'
import Symbology from './symbology/index'
import { AvlMap } from "~/modules/avl-maplibre/src"
import { DamaContext } from "~/pages/DataManager/store"
import config from "~/config.json"
import { DAMA_HOST } from "~/config"
import ckmeans from "../../../../utils/ckmeans";

import { scaleThreshold, scaleOrdinal } from "d3-scale"
const ColorRange = getColorRange(7, "BrBG")
const OrdinalColorRange = getColorRange(12, "Set3")

// import { SymbologyControls } from '~/pages/DataManager/components/SymbologyControls'
//import { DAMA_HOST } from "~/config"

const getTilehost = (DAMA_HOST) =>
  DAMA_HOST === "http://localhost:3369"
    ? "http://localhost:3370"
    : DAMA_HOST + "/tiles";

const TILEHOST = getTilehost(DAMA_HOST)

//Console.log('DAMA_HOST', DAMA_HOST, TILEHOST)


const ViewSelector = ({views}) => {
  const { viewId, sourceId, page } = useParams()
  const navigate = useNavigate()
  const {baseUrl} = React.useContext(DamaContext)

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

const IGNORED_VARIABLES = ["wkb_geometry"];

// import { getAttributes } from '~/pages/DataManager/Source/attributes'
const DefaultMapFilter = ({ source, filters, setFilters, activeViewId, layer, setTempSymbology }) => {
  const { pgEnv, falcor, falcorCache  } = React.useContext(DamaContext);



  const metadata = React.useMemo(() => {
    const md = get(source, "metadata", []);
    if (Array.isArray(md)) {
      return md;
    }
    return [];
  }, [source])

  // const allVariables = React.useMemo(() => {
  //   return metadata.map(md => md.name)
  //     .filter(v => !IGNORED_VARIABLES.includes(v));
  // }, [metadata]);

  const dataVariables = React.useMemo(() => {
    return metadata
      .filter(md => md.display === "data-variable")
      .map(md => md.name);
  }, [metadata]);

  const metaVariables = React.useMemo(() => {
    return metadata
      .filter(md => md.display === "meta-variable")
      .map(md => md.name);
  }, [metadata]);

  const variables = React.useMemo(() => {
    return [...dataVariables, ...metaVariables];
  }, [dataVariables, metaVariables]);

  const activeVar = get(filters, ["activeVar", "value"], "");
  console.log("what is the value of the active var: ", activeVar);s
  const varType = dataVariables.includes(activeVar) ? "data-variable" : "meta-variable";

  React.useEffect(() => {
    falcor.get(["dama", pgEnv, "viewsbyId", activeViewId, "data", "length"])
  }, [falcor, pgEnv, activeViewId]);

  const [dataLength, setDataLength] = React.useState(0);
  React.useEffect(() => {
    const dl = get(falcorCache, ["dama", pgEnv, "viewsbyId", activeViewId, "data", "length"], 0);
    setDataLength(dl);
  }, [falcorCache, pgEnv, activeViewId]);

  React.useEffect(() => {
    if (!(dataLength && variables.length)) return;
    falcor.chunk([
      "dama", pgEnv, "viewsbyId", activeViewId, "databyIndex",
      [...Array(dataLength).keys()], variables
    ])
  }, [falcor, pgEnv, activeViewId, dataLength, variables]);

  const [data, setData] = React.useState([]);
  React.useEffect(() => {
    if (!activeVar) setData([]);
    const databyId = get(falcorCache, ["dama", pgEnv, "viewsbyId", activeViewId, "databyId"], {});
    const data = Object.keys(databyId)
      .map(id => {
        const value = get(databyId, [id, activeVar], null);
        return {
          id,
          var: activeVar,
          value: value === 'null' ? null : value
        }
      }).filter(d => d.value !== null);
    setData(data);
  }, [falcorCache, pgEnv, activeViewId, dataLength, activeVar]);

  const scale = React.useMemo(() => {
    if (!data.length) return null;

    const domain = data.map(d => +d.value);
    if (varType === "data-variable") {
      return scaleThreshold()
        .domain(ckmeans(domain, ColorRange.length + 1))
        .range(ColorRange)
    }
    else {
      return scaleOrdinal()
        .domain(domain)
        .range(OrdinalColorRange)
    }
  }, [data, varType]);

  React.useEffect(() => {
    if (!data.length) return;

    const colors = data.reduce((a, c) => {
      a[c.id] = scale(c.value);
      return a
    }, {});

    const output = ["get", ["to-string", ["get", "ogc_fid"]], ["literal", colors]];

    const newSymbology = layer.layers.reduce((a, c) => {
      a[c.id] = {
        "fill-color": {
          [activeVar]: {
            type: varType === "data-variable" ? 'threshold' : "ordinal",
            settings: {
              range: scale.range(),
              domain: scale.domain(),
              title: activeVar
            },
            value: output
          }
        }
      };
      return a;
    }, {});
    setTempSymbology(newSymbology)
  }, [layer, data, scale, setTempSymbology, activeVar, varType]);

  return (
    <div className='flex flex-1'>
      <div className='py-3.5 px-2 text-sm text-gray-400'>Variable : </div>
      <div className='flex-1'>
        <select
            className="pl-3 pr-4 py-2.5 border border-blue-100 bg-blue-50 w-full bg-white mr-2 flex items-center justify-between text-sm"
            value={activeVar}
            onChange={(e) => setFilters({'activeVar' :{ value: e.target.value}})}
          >
            <option  className="ml-2  truncate" value={null}>
              none
            </option>
            {variables?.map((v,i) => (
              <option key={i} className="ml-2  truncate" value={v}>
                {v}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}

const MapPage = ({source,views, HoverComp, MapFilter=DefaultMapFilter, filterData = {} }) => {

  const { /*sourceId,*/ viewId } = useParams()
  const { pgEnv, baseUrl, user } = React.useContext(DamaContext);
  //const { falcor } = useFalcor()
  const [ editing, setEditing ] = React.useState(null)
  //const [ activeVar, setActiveVar] = React.useState(null)
  const [ filters, _setFilters ] = useState(filterData)
  const setFilters = React.useCallback(filters => {
    _setFilters(prev => ({ ...prev, ...filters }))
  }, []);
  const activeView = React.useMemo(() => {
    return get((views || []).filter(d => d.view_id === +viewId),'[0]', views[0])
  },[views,viewId])
  const mapData = useMemo(() => {
    let out = get(activeView,`metadata.tiles`,{sources:[], layers:[]})
    out.sources.forEach(s => {
      if(s?.source?.url) {
        s.source.url = s.source.url.replace('$HOST', TILEHOST)
      }
    })
    return out
  }, [activeView])

  const metaData = useMemo(() => {
    let out = get(activeView,`metadata`,{tiles:{sources:[], layers:[]}})
    get(out,'tiles.sources',[])
      .forEach(s => {
        if(s?.source?.url) {
          s.source.url = s.source.url.replace('$HOST', TILEHOST)
        }
      })
    return out
  }, [activeView])
  const activeViewId = React.useMemo(() => get(activeView,`view_id`,null), [activeView])

  const [ tempSymbology, setTempSymbology] = React.useState(get(mapData,'symbology',{}));

  const { sources: symSources, layers: symLayers } = tempSymbology;

  const layer = React.useMemo(() => {
      //console.log('layer update', tempSymbology)
      const sources = symSources || get(mapData,'sources',[]);
      const layers =  symLayers || get(mapData,'layers',[]);
      if(sources.length === 0 || layers.length === 0 ) {
        return null
      }
      return {
            name: source.name,
            pgEnv,
            source: source,
            activeView: activeView,
            filters,
            hoverComp: HoverComp,
            attributes: get(source,'metadata',[])?.filter(d => ['integer','string','number'].includes(d.type))
              .map(d => d.name),
            activeViewId: activeViewId,
            sources,
            layers,
            symbology: get(mapData, `symbology`, {})//{... get(mapData, `symbology`, {}), ...tempSymbology}
      }
      // add tempSymbology as depen
  },[source, views, mapData, activeViewId,filters, symSources, symLayers])

  return (
    <div>
      <div className='flex'>
        <div className='pl-3 pr-4 py-2 flex-1'>Map View  {viewId}</div>{/*{get(activeView,'id','')}*/}
        <MapFilter
          source={source}
          metaData={metaData}
          filters={filters}
          setFilters={setFilters}
          tempSymbology={tempSymbology}
          setTempSymbology={setTempSymbology}
          activeView={activeView}
          activeViewId={activeViewId}
          layer={layer}
        />
        <ViewSelector views={views} />
      </div>
      <div className='w-ful h-[900px]'>
        <Map
          layers={[layer]}
          tempSymbology={tempSymbology}
        />
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
        {/*<Symbology
          layer={layer}
          onChange={setTempSymbology}
        />
        <div className='flex'>
          <div className='flex-1' />
          <SaveSymbologyButton
            metaData={metaData}
            symbology={tempSymbology}
            viewId={activeViewId}
          />
        </div>*/}
      </div> : ''}
    </div>
  )
}

export default MapPage



const Map = ({layers,tempSymbology}) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  const {falcor} = React.useContext(DamaContext)
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

  const layerProps = React.useMemo(()=>{
    let inputViewIds = layers.filter(d => d).map(d => d.activeViewId)
    return layerData.reduce((out, cur) => {
      if(inputViewIds.indexOf(cur.activeViewId) !== -1) {
        out[cur.id] = cloneDeep(layers[inputViewIds.indexOf(cur.activeViewId)])
        out[cur.id].symbology = cloneDeep(tempSymbology)
      }
      return out
    },{})
  },[layers, layerData, tempSymbology])

  return (

      <div className='w-full h-full'>
        <AvlMap
          accessToken={ config.MAPBOX_TOKEN }
          falcor={falcor}
          mapOptions={{
            zoom: 7.3,//8.32/40.594/-74.093
            center: [
                -73.8,
               40.79
            ],
            styles: [
//              config.google_streets_style,
//              config.google_sattelite_style,
                { name: "Streets", style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9"},
                { name: "Light", style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9" },
                { name: "Dark", style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9" },

            ]
          }}
          layers={layerData}
          layerProps={layerProps}
          Sidebar={ false }
        />
      </div>

  )
}


const SaveSymbologyButton = ({metaData,symbology, viewId}) => {
  const { pgEnv, falcor } = React.useContext(DamaContext);

  const save = async () => {
    //console.log('click save 222', attr, value)
    if(viewId) {
      try{
        let val = metaData || { tiles:{} }
        val.tiles['symbology'] = symbology
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
      } catch (error) {
        console.log('error stuff',error,symbology, metaData);
      }
    }
  }
  return(
    <button
      className='inline-flex items-center gap-x-1.5 rounded-sm bg-blue-600 py-1.5 px-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
      onClick={save}
    >
      Save Symbology
    </button>
  )
}



const Edit = ({startValue, attr, viewId, parentData, cancel=()=>{}}) => {
  const [value, setValue] = useState('')
  const { pgEnv, baseUrl, falcor } = React.useContext(DamaContext);
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
    //console.log('click save 222', attr, value)
    if(viewId) {
      try{
        let update = JSON.parse(value)
        let val = parentData || {tiles:{}}
        val.tiles[attr] = update
        console.log('out value', val)
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
