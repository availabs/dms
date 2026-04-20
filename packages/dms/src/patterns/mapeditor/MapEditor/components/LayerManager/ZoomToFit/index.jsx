import React, { useContext , useMemo, useEffect, Fragment, useRef} from 'react'
import { SymbologyContext } from '../../../'
import { MapEditorContext } from "../../../../context"
import { get, set, isEqual } from 'lodash-es'
import mapboxgl from "maplibre-gl";

import useZoomToFit from "./useZoomToFit"

export const ZoomToFit = ({ layer }) => {
  const { setState  } = useContext(SymbologyContext);
  const { isZoomActive, extentBox } = useZoomToFit(layer);

// console.log("ZoomToFit::isZoomActive", isZoomActive);
// console.log("ZoomToFit::extentBox", extentBox);

  return (
    <div 
      onClick={e => {
        e.stopPropagation();
        setState(draft => {
          if (isZoomActive) {
            set(draft, `symbology.zoomToFit`, []);
          }
          else {
            set(draft, `symbology.zoomToFit`, extentBox);
          }
        })
      } }
      className={ `
        ${ isZoomActive ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-pink-50 ' }
        group flex w-full items-center text-slate-600 rounded-md px-2 py-2 text-sm
      ` }
    >
      Zoom to Fit
    </div>
  )
}

// export const ZoomToFit_OLD = ({ layer }) => {

//   const { state, setState  } = useContext(SymbologyContext);
//   const { useFalcor, pgEnv, app } = useContext(MapEditorContext);
//   const { falcor, falcorCache } = useFalcor();
//   const { view_id } = layer;

// // console.log("ZoomToFit::view_id", view_id)

//   const zoomToFit = useMemo(() => {
//     return get(state,`symbology.zoomToFit`, []);
//   }, [state]);

//   useEffect(() => {
//     if (view_id) {
//       falcor.get(["uda", pgEnv, "views", "byId", view_id, "metadata"]);
//         //.then(res => console.log("ZoomToFit::metadata::res:", res));
//     }
//   },[view_id]);

//   const viewMetadata = useMemo(() => {
//     let out = get(falcorCache, [
//         "uda", pgEnv, "views", "byId", view_id, "metadata", "value", "columns"
//     ], []);
//     if (out.length === 0) {
//       out = get(falcorCache, [
//         "uda", pgEnv, "views", "byId", view_id, "metadata", "value"
//       ], []);
//     }
//     return out;
//   }, [view_id, falcorCache]);

//   const extent = useMemo(() => {
//     return viewMetadata['extent'];
//   }, [viewMetadata]);

// // console.log("ZoomToFit::viewMetadata", viewMetadata)
// // console.log("ZoomToFit::extent", extent)

//   const updateExtent = React.useCallback(extent => {
//     falcor.set({
//       paths: [['uda', pgEnv, 'views', 'byId', view_id, "metadata"]],
//       jsonGraph: { uda: { [pgEnv]: { views: { byId: {
//         [view_id]: { metadata: JSON.stringify({ ...viewMetadata, extent }) }
//       } } } } }
//     })//.then(res => console.log("ZoomToFit::updateExtent::res", res));
//   }, [pgEnv, view_id, viewMetadata]);

//   useEffect(() => {
//     if (Object.keys(viewMetadata).length > 0 && !extent) {
//       (async () => {
//         const noOptions = JSON.stringify({});
//         const resp = await falcor.get([
//           'uda',pgEnv,'viewsById', view_id, 'options', noOptions, 'dataByIndex', {}, ['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent']
//         ]);
//         const newExtent = get(resp, ['json','uda',pgEnv,'viewsById', view_id, 'options', noOptions, 'dataByIndex',0, ['ST_AsGeojson(ST_Extent(wkb_geometry)) as bextent'] ]);
//         updateExtent(newExtent);
//         // falcor.call(
//         //   ["dama", "views", "metadata", "update"],
//         //   [pgEnv, view_id, { extent: newExtent }]
//         // ).then(res => console.log("resp from saving view extent:", res))
//       })()
//     }
//   }, [viewMetadata, extent, updateExtent]);

//   const extentBox = useMemo(() => {
//     if (extent) {
//       const parsedExtent = JSON.parse(extent);      
//       const coordinates = parsedExtent.coordinates[0];
//       const mapGeom = coordinates.reduce((bounds, coord) => {
//         return bounds.extend(coord);
//       }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
//       return [mapGeom['_sw'], mapGeom['_ne']]
//     } else {
//       return null;
//     }
//   }, [extent]);

//   const isZoomActive = isEqual(JSON.stringify(zoomToFit), JSON.stringify(extentBox));

//   return (
//     <div 
//       onClick={e => {
//         e.stopPropagation();
//         setState(draft => {
//           if(isZoomActive){
//             set(draft,`symbology.zoomToFit`,[]);
//           }
//           else {
//             set(draft,`symbology.zoomToFit`,extentBox);
//           }
//         })
//       }}
//       className={`${
//         isZoomActive ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-pink-50 '
//       } group flex w-full items-center text-slate-600 rounded-md px-2 py-2 text-sm`}
//     >
//       Zoom to Fit
//     </div>
//   )
// }