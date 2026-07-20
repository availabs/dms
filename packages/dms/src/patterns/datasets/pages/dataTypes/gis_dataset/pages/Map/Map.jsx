import React, { useEffect, useMemo, useState, useRef } from 'react';
import { get, cloneDeep } from 'lodash-es'
import { useSearchParams } from 'react-router'
import GISDatasetLayer from './Layer2'
import { AvlMap } from "../../../../../../../ui/components/map"
import { DatasetsContext } from "../../../../../context"
import { getExternalEnv } from "../../../../../utils/datasources"
import {Protocol, PMTiles} from './utils/pmtiles/index.ts'
import { ThemeContext } from "../../../../../../../ui/useTheme"
import { gisMapTheme } from "./gisMap.theme"

const PIN_OUTLINE_LAYER_SUFFIX = '_pin_outline'

const DEFAULT_MAP_STYLES = [
  { name: "Streets", style: "https://api.maptiler.com/maps/streets-v2/style.json?key=mU28JQ6HchrQdneiq6k9"},
  { name: "Light", style: "https://api.maptiler.com/maps/dataviz-light/style.json?key=mU28JQ6HchrQdneiq6k9" },
  { name: "Dark", style: "https://api.maptiler.com/maps/dataviz-dark/style.json?key=mU28JQ6HchrQdneiq6k9" }
];


const getTilehost = (DAMA_HOST) =>
  DAMA_HOST === "http://localhost:3369"
    ? "http://localhost:3370"
    : DAMA_HOST + "/tiles";



const MapPage = ({params, source,views, HoverComp, displayPinnedGeomBorder=false, mapStyles }) => {
  const [searchParams] = useSearchParams();
  const urlVariable = searchParams.get("variable")

  const {view_id: viewId } = params;
  const { datasources, isUserAuthed, DAMA_HOST, UI, setHeaderActions } = React.useContext(DatasetsContext);
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...gisMapTheme, ...(theme?.datasets?.gisMap || {}) };
  const pgEnv = getExternalEnv(datasources);
  const [ editing, setEditing ] = React.useState(null)
  const [ showSettings, setShowSettings ] = React.useState(false)
  const { Modal } = UI || {};
  // Edit-gated: a "Settings" widget injected into the source-page header (next to the version
  // selector) that opens a modal with the layer's sources/layers config. Invisible to non-editors.
  const canEditMap = isUserAuthed(['update-source']);
  React.useEffect(() => {
    if (!setHeaderActions) return;
    setHeaderActions(canEditMap ? [{ label: 'Settings', onClick: () => setShowSettings(true) }] : []);
    return () => setHeaderActions([]);
  }, [setHeaderActions, canEditMap]);
  const coalescedViewId = urlVariable && !viewId ? urlVariable : viewId; //TODO ryan this  could ahve some breaking changes elsewhere

  const activeView = React.useMemo(() => {
    let currentView = (views || []).filter(
      (d) => d.view_id === +coalescedViewId
    );
    return get(currentView, "[0]", views[0]);
  }, [views, coalescedViewId]);

    const TILEHOST = getTilehost(DAMA_HOST)

    const mapData = useMemo(() => {
    let out = get(activeView,`metadata.tiles`,{sources:[], layers:[]})
    out?.sources?.forEach(s => {
      if(s?.source?.url) {
        s.source.url = `${s.source.url.replace('$HOST', TILEHOST)}${'?cols=ogc_fid'}`
        //s.source.url
        if(s.source.url.includes('.pmtiles')){
          s.source.url = s.source.url
            .replace('https://', 'pmtiles://')
            .replace('http://', 'pmtiles://')
        }
      }
    })
    return out
  }, [activeView])

  const activeViewId = React.useMemo(() => get(activeView,`view_id`,null), [activeView])

  const [ tempSymbology, setTempSymbology] = React.useState(get(mapData,'symbology',{}));

  const { sources: symSources, layers: symLayers } = tempSymbology;

  const layer = React.useMemo(() => {
      const sources = symSources || get(mapData,'sources',[]);
      const layers =  symLayers || get(mapData,'layers',[]);
      if(sources.length === 0 || layers.length === 0 ) {
        return null
      }
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
  },[source, views, mapData, activeViewId, symSources, symLayers, displayPinnedGeomBorder])


  return (
    <div className={t.mapPageWrapper}>
      <div className={t.mapHeightWrapper}>
        <Map
          key={ viewId }
          layers={ [layer] }
          layer={layer}
          source={ source }
          tempSymbology={ tempSymbology }
          setTempSymbology={ setTempSymbology }
          mapStyles={mapStyles}/>
      </div>

      {Modal && canEditMap ? (
      <Modal open={showSettings} setOpen={setShowSettings} title={'Sources & Layers'} activeStyle={'wide'}>
        <div className={t.mapAttrsWrapper}>
        <dl className={t.mapAttrsDl}>
          {['sources','layers']
            .map((attr,i) => {
              let val = JSON.stringify(get(layer,attr,[]),null,3)
              return (
                <div key={i} className={t.mapAttrsRow}>
                  <div className={t.mapAttrsGridRow}>
                    <dt className={t.mapAttrsDt}>{attr}</dt>
                    <dd className={t.mapAttrsDd}>
                      {editing === attr ?
                        <div className={t.mapAttrsEditWrapper}>
                          <Edit
                            startValue={val}
                            attr={attr}
                            viewId={activeViewId}
                            parentData={get(activeView,`metadata`,{tiles:{}})}
                            cancel={() => setEditing(null)}
                          />
                        </div> :
                        <div className={t.mapAttrsViewWrapper}>
                          <pre className={t.mapAttrsPre}>
                            {val}
                          </pre>
                        </div>
                      }
                    </dd>
                  </div>

                  <div className={t.mapAttrsEditHoverCol} onClick={e => editing === attr ? setEditing(null): setEditing(attr)}>
                    <i className={t.mapAttrsEditIcon}/>
                  </div>
                </div>
              )
            })
          }
        </dl>
        </div>
      </Modal> ) : null}
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
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...gisMapTheme, ...(theme?.datasets?.gisMap || {}) };
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  const [layerData, setLayerData] = React.useState([])

  React.useEffect( () => {
    if (!mounted) return;

    setLayerData(l => {
      // use functional setState
      // to get info about previous layerData (l)
      let activeLayerIds = l?.map(d => d.activeViewId)?.filter(Boolean);

      let output = layers?.filter(Boolean)
          .filter(d => !activeLayerIds.includes(d.activeViewId))
          .map(l => GISDatasetLayer(l));

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

      <div className={t.mapInnerWrapper}>
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
      </div>

  )
}





const Edit = ({startValue, attr, viewId, parentData, cancel=()=>{}}) => {
  const [value, setValue] = useState('')
  const { datasources, baseUrl, falcor, UI} = React.useContext(DatasetsContext);
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...gisMapTheme, ...(theme?.datasets?.gisMap || {}) };
  const pgEnv = getExternalEnv(datasources);
  const {Button} = UI;
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
    <div className={t.editWrapper}>
      <div className={t.editRow}>
        <textarea
          ref={inputEl}
          className={t.editTextarea}
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
