import React, { useContext , useMemo, useEffect, Fragment }from 'react'
import {SymbologyContext} from '../../../'
import { MapEditorContext } from "../../../../context"
import { ThemeContext } from "../../../../../../ui/themeContext"
import { StyledControl } from '../ControlWrappers'
import {AddColumnSelectControl, controlTypes } from '../Controls'
import { get, set } from 'lodash-es'
import { Switch } from '@headlessui/react'
import { Close } from '../../icons'
const DEFAULT_STRING_FILTER = {
  operator: "==",
  value: [],
}

const DEFAULT_NUM_FILTER = {
  operator: "==",
  value: ""
}

const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}

export const DynamicFilterBuilder = ({path, params={}}) => {
  const { pgEnv, falcor, falcorCache } = useContext(MapEditorContext);
  const { UI } = useContext(ThemeContext) || {};
  const { DndList } = UI;
  const { state, setState } = React.useContext(SymbologyContext);

  const { existingFilter, existingDynamicFilter, sourceId } = useMemo(() => {
    const layerType = get(
      state,
      `symbology.layers[${state.symbology.activeLayer}]['layer-type']`
    );
    const selectedInteractiveFilterIndex = get(
      state,
      `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`
    );
    const pathBase =
      layerType === "interactive"
          ? `['interactive-filters'][${selectedInteractiveFilterIndex}]`
          : ``;

    return {
      existingFilter: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]${pathBase}['filter']`,
        params.default || params?.options?.[0]?.value || {}
      ),
      existingDynamicFilter: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]${path}`,
        []
      ),
      sourceId: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].source_id`
      )
    }
  }, [state, path, params])

  const existingFilterColumns = Object.keys(existingFilter);
  const existingDynamicColumns = existingDynamicFilter.map(filterCol => filterCol.column_name);

  useEffect(() => {
    if (sourceId) {
      falcor.get([
        "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata"
    ]);
    }
  }, [sourceId]);

  const attributes = useMemo(() => {
    let columns = get(falcorCache, [
      "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value", "columns"
    ], []);

    if (columns.length === 0) {
      columns = get(falcorCache, [
        "dama", pgEnv, "sources", "byId", sourceId, "attributes", "metadata", "value"
      ], []);
    }
    return Array.isArray(columns) ? columns : [];
  }, [sourceId, falcorCache]);

  const attributeNames = useMemo(
    () =>
      attributes
        .filter((d) => !["wkb_geometry"].includes(d))
        .map((attr) => attr.name),
    [attributes]
  );

  const availableFilterColumns = getDiffColumns(
    attributeNames,
    existingFilterColumns.concat(existingDynamicColumns)
  ).map((colName) => {
    const newAttr = attributes.find((attr) => attr.name === colName);
    return { value: colName, label: newAttr?.display_name || colName };
  }); 

  return (
    <div className='flex w-full flex-wrap'>
      <div className='flex w-full flex-wrap my-2'>
        <div className='mb-2 w-full'>
          <AddColumnSelectControl
            label="Add Dynamic Column"
            setState={(newColumn) => {
              setState((draft) => {
                if (newColumn !== "") {
                  const newAttr = attributes.find(attr => attr.name === newColumn);
                  set(
                    draft,
                    `symbology.layers[${state.symbology.activeLayer}]${path}`,
                    existingDynamicFilter
                      ? [...existingDynamicFilter, { column_name: newColumn, display_name: newAttr?.display_name || newColumn }]
                      : [{ column_name: newColumn, display_name: newAttr?.display_name || newColumn }]
                  );
                }
              });
            }}
            availableColumnNames={availableFilterColumns}
          />
        </div>
        {existingDynamicFilter.length > 0 && <div className='mb-2 w-full'>
          <ExistingColumnList 
            selectedColumns={existingDynamicFilter}  
            reorderAttrs={(start, end) => {
              const sections = [...existingDynamicFilter];
              const [item] = sections.splice(start, 1);
              sections.splice(end, 0, item);
              setState((draft) => {
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${path}`,
                  sections
                );
              });
            }}
            removeAttr={(columnName) => {
              setState((draft) => {
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${path}`,
                  existingDynamicFilter.filter((colObj) => colObj.column_name !== columnName)
                );
              })
            }}
            renameAttr={({columnName, displayName}) => {
              const newColumns = [...existingDynamicFilter];
              const columnIndex = newColumns.findIndex(colObj => colObj.column_name === columnName);
              const [item] = newColumns.splice(columnIndex, 1);
              const newItem = {...item};
              newItem.display_name = displayName;
              newColumns.splice(columnIndex, 0, newItem);
              setState((draft) => {
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${path}`,
                  newColumns
                );
              })
            }}
            setZoomToFilterBounds={(columnName, zoomToFilterBounds) => {
              const newColumns = [...existingDynamicFilter];
              const columnIndex = newColumns.findIndex(colObj => colObj.column_name === columnName);
              const [item] = newColumns.splice(columnIndex, 1);
              const newItem = {...item};
              newItem.zoomToFilterBounds = zoomToFilterBounds;
              newColumns.splice(columnIndex, 0, newItem);
              setState((draft) => {
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${path}`,
                  newColumns
                );
                if(!zoomToFilterBounds) {
                  set(
                    draft,
                    `symbology.layers.zoomToFilterBounds`,
                    []
                  );
                }
              })
            }}
          />
        </div>}
      </div>
    </div>

  )
}

export const ExistingColumnList = ({
  selectedColumns,
  reorderAttrs,
  removeAttr,
  renameAttr,
  setZoomToFilterBounds,
}) => {
  return (
    <>
      <div className="group/title w-full text-sm grid grid-cols-9 cursor-grab border-t border-slate-20">
        <div className="truncate  col-span-3 px-1 py-1 border-r">
          <div className=" p-1 text-sm text-slate-700 font-bold">Name</div>
        </div>
        <div className="truncate  col-span-3 px-1 py-1 border-r">
          <div className=" p-1 text-sm text-slate-700 font-bold">Display name</div>
        </div>
        <div className="truncate  col-span-2 px-1 py-1">
          <div className=" p-1 text-sm text-slate-700 font-bold">Zoom</div>
        </div>
      </div>
      <DndList onDrop={reorderAttrs}>
        {selectedColumns?.map((selectedColumn, i) => {
          return (
            <div
              key={i}
              className="group/title w-full text-sm grid grid-cols-9 cursor-grab border-t border-slate-20"
            >
              <div className="truncate  col-span-3 px-1 py-1 border-r">
                <div className=" p-1 text-sm text-slate-700">
                  {selectedColumn.column_name}
                </div>
              </div>
              <div className="truncate  col-span-3 py-1 border-r">
                <div className=" p-1 text-sm text-slate-700">
                  <input
                    type="text"
                    className="w-full px-1 border text-sm border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6 "
                    value={selectedColumn.display_name}
                    onChange={(e) => {
                      renameAttr({
                        columnName: selectedColumn.column_name,
                        displayName: e.target.value,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="truncate  col-span-2 py-1 items-center content-center justify-center flex">
                <input
                  value={selectedColumn.zoomToFilterBounds}
                  checked={selectedColumn.zoomToFilterBounds}
                  type="checkbox"
                  onChange={(e) => {
                    setZoomToFilterBounds(selectedColumn.column_name, !selectedColumn.zoomToFilterBounds)
                  }}
                >
                </input>
              </div>
              <div
                className="flex items-center  cursor-pointer fill-white group-hover/title:fill-slate-300 hover:bg-slate-100 rounded group/icon col-span-1 p-0.5"
                onClick={() => {
                  removeAttr(selectedColumn.column_name);
                }}
              >
                <Close className="cursor-pointer group-hover/icon:fill-slate-500 " />
              </div>
            </div>
          );
        })}
      </DndList>
    </>
  );
};