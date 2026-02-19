import { useContext , useMemo, useEffect, Fragment, useRef} from 'react'
import { SymbologyContext } from '../../../'
import { MapEditorContext } from "../../../../context"
import get from 'lodash/get'
import set from 'lodash/set'
import isEqual from 'lodash/isEqual'
import mapboxgl from "maplibre-gl";

export const ZoomToFit = ({ layer }) => {

  const { state, setState  } = useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = useContext(MapEditorContext);
  const { view_id } = layer;
  const { zoomToFit } = useMemo(() => ({
    zoomToFit: get(state,`symbology.zoomToFit`),
  }),[state])

  useEffect(() => {
    if(view_id) {
      falcor.get([
          "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata"
      ]);
    }
  },[view_id]);

  const viewMetadata = useMemo(() => {
    let out = get(falcorCache, [
        "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata", "value", "columns"
    ], []);
    if(out.length === 0) {
      out = get(falcorCache, [
        "dama", pgEnv, "views", "byId", view_id, "attributes", "metadata", "value"
      ], []);
    }
    return out;
  }, [view_id, falcorCache]);

  const extent = useMemo(() => {
    return viewMetadata['extent'];
  }, [viewMetadata]);

  useEffect(() => {
    const getExtent = async () => {
      const newOptions = JSON.stringify({
      })
      const resp = await falcor.get([
        'dama',pgEnv,'viewsbyId', view_id, 'options', newOptions, 'databyIndex',{ },['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent']
      ]);
      const newExtent = get(resp, ['json','dama',pgEnv,'viewsbyId', view_id, 'options', newOptions, 'databyIndex',0,['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent'] ])
      falcor.call(
        ["dama", "views", "metadata", "update"],
        [pgEnv, view_id, { extent: newExtent }]
      ).then(res => console.log("resp from saving view extent:", res))
    }
    if(Object.keys(viewMetadata).length > 0 && !extent) {
      getExtent();
    }
  }, [viewMetadata, extent]);

  const extentBox = useMemo(() => {
    if (extent) {
      const parsedExtent = JSON.parse(extent);      
      const coordinates = parsedExtent.coordinates[0];
      const mapGeom = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      return [mapGeom['_sw'], mapGeom['_ne']]
    } else {
      return null;
    }
  }, [extent]);

  const isZoomActive = isEqual(JSON.stringify(zoomToFit), JSON.stringify(extentBox));
  return (
  <div 
    onClick={() => {
      setState(draft => {
        if(isZoomActive){
          set(draft,`symbology.zoomToFit`,[]);
        }
        else {
          set(draft,`symbology.zoomToFit`,extentBox);
        }
      })
    }}
    className={`${
      isZoomActive ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-pink-50 '
    } group flex w-full items-center text-slate-600 rounded-md px-2 py-2 text-sm`}
  >
    Zoom to Fit
  </div>
)}