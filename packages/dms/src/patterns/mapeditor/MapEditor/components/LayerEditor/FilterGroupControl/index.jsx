
import { useContext, useMemo, useEffect } from "react";
import {ColumnSelectControl} from "./ColumnSelectControl";
import {SymbologyContext} from '../../../'
import { MapEditorContext } from "../../../../context"
import { get, set } from 'lodash-es'
const FilterGroupControl = ({path, datapath, params={}}) => {
  const { state, setState } = useContext(SymbologyContext);
  const { useFalcor, pgEnv } = useContext(MapEditorContext);
  const { falcor } = useFalcor();
  const pathBase = params?.version === "interactive"
    ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
    : `symbology.layers[${state.symbology.activeLayer}]`;

  const { layerType, viewId, sourceId, filterGroupName, filterGroup, dataColumn, selectedInteractiveFilterIndex,legendViewId, filterGroupLegendColumn } = useMemo(() => ({
    dataColumn:get(state,`${pathBase}['data-column']`),
    legendViewId:get(state,`${pathBase}['legend-view-id']`),
    filterGroupLegendColumn:get(state,`${pathBase}['filter-group-legend-column']`),
    layerType: get(state,`${pathBase}['layer-type']`),
    viewId: get(state,`symbology.layers[${state.symbology.activeLayer}].view_id`),
    sourceId: get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`),
    filterGroupEnabled: get(state,`${pathBase}['filterGroupEnabled']`, false),
    filterGroup: get(state,`${pathBase}${path}`, []),
    filterGroupName: get(state,`${pathBase}['filter-group-name']`, ''),
    selectedInteractiveFilterIndex: get(
      state,
      `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`,
      []
    ),
  }),[state])

  useEffect(() => {
    if (sourceId) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", sourceId, "metadata"
      ]);
    }
  }, [sourceId]);

  return (
    <div className="pb-4 max-h-[calc(80vh_-_220px)] overflow-auto">
      <div className="group w-full flex px-2">
        Name: 
        <input
          type="text"
          className="mx-2 w-[150px]  border text-sm border-transparent group-hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
          value={filterGroupName}
          onChange={(e) => {
            setState(draft => {
              set(draft, `${pathBase}['filter-group-name']`, e.target.value)
            })
          }}
        />
      </div>
      <ColumnSelectControl
        path={`['filter-group']`}
        params={{
          default: dataColumn,
          onlyTypedAttributes: true,
          pathPrefix: params.pathPrefix,
          version: params?.version
        }}
        setFilterGroupLegendColumn={
          (columnName) => {
            setState(draft => {
              set(draft, `${pathBase}['choroplethdata']`, {});
              set(draft, `${pathBase}['category-data']`, {});
              set(draft, `${pathBase}['categories']`, {});
              set(draft, `${pathBase}['data-column']`, columnName);
              set(draft, `${pathBase}['filter-group-legend-column']`, columnName)
            })
          }
        }
      />
    </div>
  )
}

export { FilterGroupControl }
