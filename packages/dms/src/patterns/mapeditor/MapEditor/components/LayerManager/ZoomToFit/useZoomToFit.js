import React, { useContext , useMemo, useEffect, Fragment, useRef} from 'react'
import { SymbologyContext } from '../../../'
import { MapEditorContext } from "../../../../context"
import { get, set, isEqual } from 'lodash-es'
import mapboxgl from "maplibre-gl";

const useZoomToFit = (layer, shouldUpdateMetadata = true) => {

  const { state  } = useContext(SymbologyContext);
  const { useFalcor, pgEnv } = useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  const { view_id } = layer;

// console.log("useZoomToFit::view_id", view_id)

  const zoomToFit = useMemo(() => {
    return get(state,`symbology.zoomToFit`, []);
  }, [state]);

  useEffect(() => {
    if (view_id) {
      falcor.get(["uda", pgEnv, "views", "byId", view_id, "metadata"]);
        //.then(res => console.log("useZoomToFit::metadata::res:", res));
    }
  },[view_id]);

  const viewMetadata = useMemo(() => {
    let out = get(falcorCache, [
        "uda", pgEnv, "views", "byId", view_id, "metadata", "value", "columns"
    ], []);
    if (out.length === 0) {
      out = get(falcorCache, [
        "uda", pgEnv, "views", "byId", view_id, "metadata", "value"
      ], []);
    }
    return out;
  }, [view_id, falcorCache]);

  const extent = useMemo(() => {
    return viewMetadata['extent'];
  }, [viewMetadata]);

// console.log("useZoomToFit::viewMetadata", viewMetadata)
// console.log("useZoomToFit::extent", extent)

  const updateMetadata = React.useCallback(extent => {

// console.log("useZoomToFit::updateMetadata", extent);

    falcor.set({
      paths: [['uda', pgEnv, 'views', 'byId', view_id, "metadata"]],
      jsonGraph: { uda: { [pgEnv]: { views: { byId: {
        [view_id]: { metadata: JSON.stringify({ ...viewMetadata, extent }) }
      } } } } }
    }).then(res => console.log("useZoomToFit::updateMetadata::res", res));
  }, [pgEnv, view_id, viewMetadata]);

  useEffect(() => {
    if (Object.keys(viewMetadata).length > 0 && !extent) {

// console.log("RETRIEVING NEW EXTENT");

      (async () => {
        const noOptions = JSON.stringify({});
        const resp = await falcor.get([
          'uda',pgEnv,'viewsById', view_id, 'options', noOptions, 'dataByIndex', {}, ['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent']
        ]);
        const newExtent = get(resp, ['json','uda',pgEnv,'viewsById', view_id, 'options', noOptions, 'dataByIndex',0, ['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent'] ]);

// console.log("useZoomToFit::newExtent", newExtent);

        shouldUpdateMetadata && updateMetadata(newExtent);
        // falcor.call(
        //   ["dama", "views", "metadata", "update"],
        //   [pgEnv, view_id, { extent: newExtent }]
        // ).then(res => console.log("resp from saving view extent:", res))
      })()
    }
  }, [viewMetadata, extent, updateMetadata, shouldUpdateMetadata]);

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

  return { isZoomActive, extentBox };
}

export default useZoomToFit;