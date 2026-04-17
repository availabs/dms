import React, { useContext , useMemo, useEffect, Fragment }from 'react'
import {SymbologyContext} from '../../../'
import { MapEditorContext } from "../../../../context"
import { StyledControl } from '../ControlWrappers'
import {AddColumnSelectControl, controlTypes } from '../Controls'
import { get, set } from 'lodash-es'

const {simple: SimpleControl, select: SelectControl} = controlTypes;
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}
const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}


const FILTER_OPERATORS = {
  string: ["!=", "==" ],
  integer: ["!=", "<", "<=", "==", ">=", ">", "between" ],
  number: ["!=", "<", "<=", "==", ">=", ">", "between" ]
};

export const ExistingFilterList = ({removeFilter, activeColumn, setActiveColumn}) => {
  const { state, setState } = React.useContext(SymbologyContext);
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
  const existingFilter = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}]${pathBase}.filter`,
    {}
  );

  const sourceId = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}].source_id`
  );
  const { pgEnv, useFalcor } = useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();

  useEffect(() => {
    if (sourceId) {
      falcor.get([
        "uda", pgEnv, "sources", "byId", sourceId, "metadata"
    ]);
    }
  }, [sourceId]);

  const attributes = useMemo(() => {
    let columns = get(falcorCache, [
      "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns"
    ], []);

    if (columns.length === 0) {
      columns = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value"
      ], []);
    }
    return Array.isArray(columns) ? columns : [];
  }, [sourceId, falcorCache]);

  return (
    <div className="flex w-full flex-wrap">
      {Object.keys(existingFilter || {})?.map((selectedCol, i) => {
        const selectedColAttr = attributes?.find(attr => attr.name === selectedCol) || {};
        const filter = existingFilter[selectedCol];
        const filterRowClass = activeColumn === selectedCol ? 'bg-pink-100' : ''
        const filterIconClass = activeColumn === selectedCol ? 'text-pink-100': 'text-white' 

        const isEqualityOperator = selectedColAttr.type === "string" && ["!=", "=="].includes(filter.operator);
        const isBetweenOperator = filter.operator === "between";

        const display_name = attributes.find(attr => attr.name === selectedCol)?.display_name || selectedCol;
        let displayedValue = filter?.value;

        if(isEqualityOperator){
          if(Array.isArray(filter?.value)){
            displayedValue = filter?.value?.join(", ");
          }          
        }
        else if(isBetweenOperator){
          if(Array.isArray(filter?.value)){
            displayedValue = filter?.value?.join(" and ");
          }
        }
        return (
          <div
            key={i}
            className={`${filterRowClass} m-1 border border-slate-200 rounded group/title w-full px-1 text-sm grid grid-cols-9 cursor-pointer hover:border-pink-500 hover:border`}
            onClick={() => {setActiveColumn(selectedCol)}}
          >
            <div className="truncate col-span-8 py-1">
              {display_name} <span className="font-thin">{filter.operator}</span> {displayedValue}
            </div>

            <div
              className={`cursor-pointer ${filterIconClass} group-hover/title:text-black group/icon col-span-1 p-1`}
              onClick={(e) => {
                e.stopPropagation();
                removeFilter(selectedCol)
              }}
            >
              <i
                className="mx-2 fa fa-x cursor-pointer group-hover/icon:text-pink-800"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};


export function FilterBuilder({ path, params = {} }) {
  const { state, setState } = React.useContext(SymbologyContext);
  const [filterSearchValue, setFilterSearchValue] = React.useState("");
  const { activeColumn: activeColumnName, setActiveColumn } = params;
  const { sourceId } = useMemo(
    () => ({
      sourceId: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].source_id`
      ),
    }),
    [state]
  );
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
    return columns;
  }, [sourceId, falcorCache]);

  const activeAttr = useMemo(() => {
    return attributes.find((attr) => attr.name === activeColumnName);
  }, [activeColumnName]);

  const filterOperators = FILTER_OPERATORS[activeAttr?.type] || [];
  const existingFilter = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}]${path}`,
    {}
  );

  const valuePath = `${path}.${activeColumnName}.value`;
  const isBetweenOperator = existingFilter?.[activeColumnName]?.operator === "between";
  const isEqualityOperator = activeAttr?.type === "string" && ["!=", "=="].includes(existingFilter?.[activeColumnName]?.operator);

  const valueInputComponent = isEqualityOperator ? (
    <StyledControl>
      <label className='flex'>
        <div className='flex items-center'>
          <input
            className='w-full'
            type='text' 
            value={filterSearchValue}
            onChange={(e) => {setFilterSearchValue(e.target.value)}}
          />
        </div>
      </label>
    </StyledControl>
  ) : (
    <StyledControl>
      <SimpleControl path={valuePath + (isBetweenOperator ? "[0]" : "")} params={{default:''}}/>
    </StyledControl>
  );

  const valueLabel = isEqualityOperator ? "Search:" : "Value:";
  const valueLabelComponent = isBetweenOperator ? null : (
    <div className="p-1">{valueLabel}</div>
  );

  return (
    <>
      {!activeColumnName && (
        <AddFilterColumn
          path={path}
          params={params}
          setActiveColumn={setActiveColumn}
        />
      )}

      {activeColumnName && (
        <>
          <div className='mx-4'>
            <div className="flex my-1 items-center">
              <div className="p-1">Column:</div>
              <div className="p-2">{activeAttr.display_name ?? activeColumnName}</div>
            </div>
            <div className="flex my-1 items-center">
              <div className="p-1">Operator:</div>
              <StyledControl>
                <SelectControl
                  path={`${path}.${activeColumnName}.operator`}
                  params={{
                    options: filterOperators.map((operator) => ({
                      value: operator,
                      name: operator,
                    })),
                  }}
                />
              </StyledControl>
            </div>
            <div className="flex my-1 items-center">
              {valueLabelComponent}
              {valueInputComponent}
            </div>
            {
              isBetweenOperator &&
                <>
                  <div className="p-1">And</div>
                  <div className="flex my-1 items-center">
                    
                    <StyledControl>
                      <SimpleControl path={valuePath + "[1]"} params={{default:''}}/>
                    </StyledControl>
                  </div>
                </>
            }
          </div>
          {
            isEqualityOperator && 
              <EqualityFilterValueList params={params} path={valuePath} filterSearchValue={filterSearchValue}/>
          }
        </>  
      )}
    </>
  );
}

function AddFilterColumn({ path, params = {}, setActiveColumn }) {
  const { state, setState } = React.useContext(SymbologyContext);
  const existingFilter = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}].${path}`,
    params.default || params?.options?.[0]?.value || {}
  );

  const existingFilterColumns = Object.keys(existingFilter);

  const sourceId = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}].source_id`
  );
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
    return columns;
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
    existingFilterColumns
  ).map((colName) => {
    const newAttr = attributes.find((attr) => attr.name === colName);
    return { value: colName, label: newAttr?.display_name || colName };
  }); 
  
  const DEFAULT_STRING_FILTER = {
    operator: "==",
    value: [],
  }

  const DEFAULT_NUM_FILTER = {
    operator: "==",
    value: ""
  }

  return (
    <AddColumnSelectControl
      setState={(newColumn) => {
        setState((draft) => {
          if (newColumn !== "") {
            const newAttr = attributes.find(attr => attr.name === newColumn);
            let newValue = {
              ...DEFAULT_STRING_FILTER,
              columnName: newColumn,
            };
            if(newAttr.type !== "string") {
              newValue = {
                ...DEFAULT_NUM_FILTER,
                columnName: newColumn,
              }
            }

            set(
              draft,
              `symbology.layers[${state.symbology.activeLayer}].${path}.${newColumn}`,
              newValue
            );
          }
        });
        setActiveColumn(newColumn);
      }}
      availableColumnNames={availableFilterColumns}
    />
  );
}


function EqualityFilterValueList({params, path, filterSearchValue}) {
  const { pgEnv, useFalcor } = useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  const { state, setState } = React.useContext(SymbologyContext);
  const {activeColumn: activeColumnName, setActiveColumn} = params;
  const { viewId, sourceId } = useMemo(
    () => ({
      viewId: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].view_id`
      ),
      sourceId: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].source_id`
      ),
    }),
    [state]
  );

  useEffect(() => {
    if (sourceId) {
      falcor.get([
        "uda", pgEnv, "sources", "byId", sourceId, "metadata"
      ]);
    }
  }, [sourceId]);

  const options = JSON.stringify({
    groupBy: [(activeColumnName).split('AS ')[0]],
    exclude: {[(activeColumnName).split('AS ')[0]]: ['null']}
  })
  useEffect(() => {
    falcor.get([
      "uda",
      pgEnv,
      "viewsById",
      viewId,
      "options",
      options,
      "dataByIndex",
      { from: 0, to: 500 },
      [activeColumnName, "count(1)::int as count"],
    ]);
  }, [falcor, pgEnv, viewId, activeColumnName]);

  const sampleData = useMemo(() => {
    return Object.values(
      get(
        falcorCache,
        ["uda", pgEnv, "viewsById", viewId, "options", options, "dataByIndex"],
        {}
      )
    );
  }, [pgEnv, falcorCache]);

  const sampleRows = useMemo(() => {
    return sampleData
      ?.map(row => row[activeColumnName])
      ?.filter((item) => typeof item === 'string' && item !== "null")
      ?.filter(onlyUnique);
  }, [sampleData, activeColumnName]);
  sampleRows.sort();

  const currentFilterValue = get(
    state,
    `symbology.layers[${state.symbology.activeLayer}].${path}`,
    params.default || params?.options?.[0]?.value
  );
  return sampleRows
    ?.filter((sampleValue) =>
      sampleValue
        ?.toString()
        ?.toLowerCase()
        ?.includes(filterSearchValue.toString().toLowerCase())
    )
    .map((sampleValue, i) => {
      const isValueSelected = currentFilterValue?.includes(sampleValue)
      const selectedClass = isValueSelected ? "bg-pink-100" : "";
      return (
        <div
          key={i}
          className={`${selectedClass} px-4 w-full text-sm hover:bg-pink-200 hover:cursor-pointer`}
          onClick={() =>
            setState((draft) => {  

              const newValue = isValueSelected
                ? currentFilterValue.filter(
                    (filterVal) => filterVal !== sampleValue
                  )
                : [...(Array.isArray(currentFilterValue) ? currentFilterValue : []), sampleValue];
                // : [...currentFilterValue, sampleValue];
              set(
                draft,
                `symbology.layers[${state.symbology.activeLayer}].${path}`,
                newValue
              );
            })
          }
        >
          <div className="flex">
            <input
              readOnly
              type="checkbox"
              checked={isValueSelected}
            />
            <div className="truncate flex items-center text-[13px] px-4 py-1">
              {sampleValue}
            </div>
          </div>
        </div>
      );
    });
}
