
import { useContext, useMemo, useEffect } from "react";
import {SymbologyContext} from '../../../'
import { MapEditorContext } from "../../../../context"
import { get, set } from 'lodash-es'
import {AddColumnSelectControl} from '../Controls'
import { Close, StarSolid } from '../../icons'
import { SourceAttributes, ViewAttributes, getAttributes } from "../../../../attributes"
import { ThemeContext } from "../../../../../../ui/themeContext"
import { v1 } from "uuid";
const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}
const ViewGroupControl = ({path, datapath, params={}}) => {
  const { state, setState } = useContext(SymbologyContext);
  const { falcor, falcorCache, pgEnv } = useContext(MapEditorContext);
  const { UI } = useContext(ThemeContext) || {};
  const { DndList } = UI;
  const pathBase = params?.version === "interactive"
    ? `symbology.layers[${state.symbology.activeLayer}]${params.pathPrefix}`
    : `symbology.layers[${state.symbology.activeLayer}]`;

  const { layerType, viewId, sourceId, viewGroupName, viewGroup, initialViewId, viewGroupId } = useMemo(() => ({
    layerType: get(state,`${pathBase}['layer-type']`),
    viewId: get(state,`symbology.layers[${state.symbology.activeLayer}].view_id`),
    sourceId: get(state,`symbology.layers[${state.symbology.activeLayer}].source_id`),
    viewGroup: get(state,`${pathBase}['filter-source-views']`, []),
    viewGroupName: get(state,`${pathBase}['view-group-name']`, ''),
    initialViewId: get(state,`${pathBase}['initial-view-id']`, ''),
    filterGroupLegendColumn: get(state, `${pathBase}['filter-group-legend-column']`),
    viewGroupId:get(state,`${pathBase}['view-group-id']`),
  }),[state])

  if (layerType === "interactive") {
    layerPath = `['interactive-filters'][${selectedInteractiveFilterIndex}]`;
  }

  useEffect(() => {
    if(!initialViewId){
      setState(draft => {
        set(draft,`${pathBase}['initial-view-id']`, viewId);
      })
    }
  }, [])

  //----------------------------------
  // -- get selected source views
  // ---------------------------------
  useEffect(() => {
    async function fetchData() {
      //console.time("fetch data");
      const lengthPath = ["dama", pgEnv, "sources", "byId", sourceId, "views", "length"];
      const resp = await falcor.get(lengthPath);
      return await falcor.get([
        "dama", pgEnv, "sources", "byId", sourceId, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        "attributes", Object.values(ViewAttributes)
      ]);
    }
    if(sourceId) {
      fetchData();
    }
  }, [sourceId, falcor, pgEnv]);

  const views = useMemo(() => {
    return Object.values(get(falcorCache, ["dama", pgEnv, "sources", "byId", sourceId, "views", "byIndex"], {}))
      .map(v => getAttributes(get(falcorCache, v.value, { "attributes": {} })["attributes"]));
  }, [falcorCache, sourceId, pgEnv]);

  const viewIds = views.map(v => v.view_id);
  const availableViewIds = getDiffColumns(viewIds, viewGroup);
  const availableViews = views.filter(v => availableViewIds.includes(v.view_id));
  const selectedViews = views.filter(v => viewGroup.includes(v.view_id));

  return (
    <div className="pb-2 max-h-[calc(80vh_-_220px)] overflow-auto">
      <div className="group w-full flex px-2">
        Name: 
        <input
          type="text"
          className="mx-2 w-[150px]  border text-sm border-transparent group-hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6"
          value={viewGroupName}
          onChange={(e) => {
            setState(draft => {
              set(draft, `${pathBase}['view-group-name']`, e.target.value)
            })
          }}
        />
      </div>
      <div className="pb-2">
        <AddColumnSelectControl
          label={"Add Data View"}
          setState={(newViewId) => {
            setState((draft) => {
              console.log("adding new viewId to group::", newViewId)
              set(
                draft,
                `${pathBase}.${path}`,
                [...viewGroup, parseInt(newViewId)]
              );
            });
          }}
          availableColumnNames = { 
            availableViews.map(v => {
              return { value: v.view_id, label: v.version ?? v.view_id };
            }) 
          }
        />
      </div>
      <ExistingColumnList
        setViewGroupId={
          (viewId) => {
            setState(draft => {
              set(draft, `${pathBase}['view-group-id']`, viewId)
            })
          }
        }
        viewGroupId={viewGroupId}
        selectedViews={selectedViews.map(v => ({...v, display_name: v.version ?? v.view_id}))}
        reorderAttrs={(start, end) => {
          const sections = [...viewGroup];
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
        removeAttr={(viewId) => {
          //console.log('column_name', viewId, selectedColumns.filter((colObj) => colObj.column_name !== viewId))
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              viewGroup.filter((colObj) => colObj !== viewId)
            );
          })
        }}
      />
    </div>

  )
}

export const ExistingColumnList = ({selectedViews, reorderAttrs, removeAttr, viewGroupId, setViewGroupId}) => {
  const { UI } = useContext(ThemeContext) || {};
  const { DndList } = UI;
  return (
    <DndList
      onDrop={reorderAttrs}
    >
      {selectedViews?.map((selectedView, i) => {
        return (
          <div
            key={i}
            className="group/title w-full text-sm grid grid-cols-10 cursor-grab border-t border-slate-20"
          >
            <div
              className="flex items-center border-slate-200 cursor-pointer fill-white group-hover/title:fill-slate-300 hover:bg-slate-100 rounded group/icon col-span-1 p-0.5"
              onClick={() => {
                console.log("legend prop change, setting viewId::",selectedView)
                setViewGroupId(selectedView.view_id)
              }}
            >
              <StarSolid
                size={18}
                className={`${viewGroupId === selectedView.view_id ? 'fill-pink-400 ': ''} cursor-pointer group-hover/icon:fill-slate-500 `}
              />
            </div>
            <div 
            className="truncate  col-span-8 px-2 py-1"
            >
              <div
                
                className='w-full p-1 text-sm     text-slate-700s'

              >
              {selectedView.display_name}
              </div>
              
            </div>
            <div
              className="flex items-center  cursor-pointer fill-white group-hover/title:fill-slate-300 hover:bg-slate-100 rounded group/icon col-span-1 p-0.5"
              onClick={() => {
                removeAttr(selectedView.view_id)
              }}
            >
              <Close
                className="cursor-pointer group-hover/icon:fill-slate-500 "
              />
            </div>
          </div>
        );
      })}
    </DndList>
  );
};


export { ViewGroupControl }
