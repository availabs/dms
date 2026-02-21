import React, { useContext , useMemo, useEffect }from 'react'
import { SymbologyContext } from "../../../";
import { MapEditorContext } from "../../../../context"

import { Close } from '../../icons'
import { DndList, Button } from '~/modules/avl-components/src'

import {AddColumnSelectControl} from "../Controls"
import get from 'lodash/get'
import set from 'lodash/set'
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}
const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}

export function ColumnSelectControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
      : `symbology.layers[${state.symbology.activeLayer}]`;

  const { selectedColumns, layerType } = useMemo(() => {
    return {
      selectedColumns: get(state, `${pathBase}.${path}`),
      layerType: get(state, `${pathBase}['layer-type']`),
    };
  }, [state, path, params]);

  const viewId = get(state,`symbology.layers[${state.symbology.activeLayer}].view_id`)
  const sourceId = get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`);
  const { pgEnv, falcor, falcorCache } = useContext(MapEditorContext);

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

    if(params.onlyTypedAttributes) {
      columns = columns.filter(d => {
        if(layerType === 'choropleth' && !['integer', 'number'].includes(d.type)){
          return false
        }
        return true
      })
    }

    return columns;
  }, [sourceId, falcorCache]);

  const attributeNames = useMemo(
    () => {
      console.log('what are attributes', attributes)
      return (attributes || []).map((attr) => attr.name)
    },[attributes]);

  useEffect(() => {
    if(selectedColumns === undefined) {
      if(!params.default){
        setState((draft) => {
          set(
            draft,
            `${pathBase}.${path}`,
            attributes
              .filter((d) => !["wkb_geometry"].includes(d.name))
              .map((attr) => ({
                column_name: attr.name,
                display_name: attr?.display_name || attr.name,
              }))
          );
        });
      } else {
        setState((draft) => {
          set(
            draft,
            `${pathBase}.${path}`,
            attributes
              .filter(attr => attr.name === params.default)
              .map((attr) => ({
                column_name: attr.name,
                display_name: attr?.display_name || attr.name,
              }))
          );
        });
      }
    }
  }, [attributes]);

  const selectedColumnNames = useMemo(() => {
    return selectedColumns ? (typeof selectedColumns[0] === "string"
      ? selectedColumns
      : selectedColumns.map((columnObj) => columnObj?.column_name)) : undefined;
  }, [selectedColumns]);
  const availableColumnNames = useMemo(() => {
    return (
      selectedColumnNames
        ? getDiffColumns(attributeNames, selectedColumnNames)
        : attributeNames
    ).filter((d) => !["wkb_geometry"].includes(d));
  }, [selectedColumnNames, attributeNames]);

  React.useEffect(() => {
    falcor.get([
      "dama",
      pgEnv,
      "viewsbyId",
      viewId,
      "databyIndex",
      {"from":0, "to": 100},
      selectedColumnNames
    ])
  }, [falcor, pgEnv, viewId, selectedColumnNames]);

  const sampleData = useMemo(() => {
    return Object.values(
      get(falcorCache, ["dama", pgEnv, "viewsbyId", viewId, "databyIndex"], [])
    ).map((v) =>  {
      // console.log('what', v)

      return v?.value ? get(falcorCache, v.value, "") : ""
    });
  }, [pgEnv, falcorCache]);

  return (
    <div className='flex w-full flex-wrap'>
      <div className='flex w-full flex-wrap my-2'>
        <AddColumnSelectControl
          setState={(newColumn) => {
            setState((draft) => {
              if (newColumn !== "") {
                const newAttr = attributes.find(attr => attr.name === newColumn);
                set(
                  draft,
                  `${pathBase}.${path}`,
                  selectedColumns
                    ? [...selectedColumns, { column_name: newColumn, display_name: newAttr?.display_name || newColumn }]
                    : [{ column_name: newColumn, display_name: newAttr?.display_name || newColumn }]
                );
              }
            });
          }}
          availableColumnNames = {
            availableColumnNames.map(colName => {
              const newAttr = attributes.find(attr => attr.name === colName);
              return { value: colName, label: newAttr?.display_name || colName };
            })
          }
        />
      </div>
      <div className='flex w-full flex-wrap my-2 mx-4 justify-around'>
        <Button
          themeOptions={{ size: "xs", color: 'primary' }}
          className={availableColumnNames?.length === 0 ? "disabled:opacity-75 pointer-events-none	" : " "}
          disabled={availableColumnNames?.length === 0}
          onClick={() => {
            setState(draft => {
              set(
                draft,
                `${pathBase}.${path}`,
                attributes
                  .filter((d) => !["wkb_geometry"].includes(d.name))
                  .map((attr) => ({
                    column_name: attr.name,
                    display_name: attr?.display_name || attr.name,
                  }))
              );
            })

          }}
        >
          Add All Columns
        </Button>
        <Button
          themeOptions={{ size: "xs", color: 'danger' }}
          className={selectedColumnNames?.length === 0 ? "disabled:opacity-75 pointer-events-none	bgDanger" : " bgDanger"}
          disabled={selectedColumnNames?.length === 0}
          onClick={() => {
            setState(draft => {
              set(
                draft,
                `${pathBase}.${path}`,
                []
              );
            })

          }}
        >
          Remove All Columns
        </Button>
      </div>
      <ExistingColumnList
        selectedColumns={selectedColumns}
        sampleData={sampleData}
        reorderAttrs={(start, end) => {
          const sections = [...selectedColumns];
          const [item] = sections.splice(start, 1);
          sections.splice(end, 0, item);

          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              sections
            );
          });
        }}
        renameAttr={({columnName, displayName}) => {
          const newColumns = [...selectedColumns];
          const columnIndex = newColumns.findIndex(colObj => colObj.column_name === columnName);
          const [item] = newColumns.splice(columnIndex, 1);
          const newItem = {...item};
          newItem.display_name = displayName;
          newColumns.splice(columnIndex, 0, newItem);
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              newColumns
            );
          })
        }}
        removeAttr={(columnName) => {
          //console.log('column_name', columnName, selectedColumns.filter((colObj) => colObj.column_name !== columnName))
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              selectedColumns.filter((colObj) => colObj.column_name !== columnName)
            );
          })
        }}
      />
    </div>
  );
}

const ExistingColumnList = ({selectedColumns, sampleData, path, reorderAttrs, removeAttr, renameAttr}) => {
  return (
    <DndList
      onDrop={reorderAttrs}
    >
      {selectedColumns?.map((selectedCol, i) => {
        return (
          <div
            key={i}
            className="group/title w-full text-sm grid grid-cols-9 cursor-grab"
          >
            <div className="truncate border-t border-r border-slate-200 col-span-4 px-2 py-1">
              <input
                  type="text"
                  className='w-full px-2  border text-sm border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6'
                  value={selectedCol.display_name}
                  onChange={(e) => {
                    renameAttr({columnName:selectedCol.column_name , displayName:e.target.value})
                  }}
                />
            </div>
            <div className="truncate flex items-center text-[13px] border-t border-slate-200 col-span-4 text-slate-300 px-4 py-1">
              {sampleData
                .map((row) => row[selectedCol.column_name])
                .filter(item => item !== 'null')
                .filter(onlyUnique)
                .slice(0,2)
                .join(", ")}
            </div>
            <div
              className="border-t flex items-center border-slate-200 cursor-pointer fill-white group-hover/title:fill-slate-300 hover:bg-slate-100 rounded group/icon col-span-1 p-0.5"
              onClick={() => {
                removeAttr(selectedCol.column_name)
              }}
            >
              <Close
                className="mx-[6px] cursor-pointer group-hover/icon:fill-slate-500 "
              />
            </div>
          </div>
        );
      })}
    </DndList>
  );
};
