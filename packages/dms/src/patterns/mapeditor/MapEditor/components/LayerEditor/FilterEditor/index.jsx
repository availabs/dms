import React, { useContext, useMemo, useState } from "react";
import { Button } from "~/modules/avl-components/src";
import { SymbologyContext } from "../../../";
import { ExistingFilterList, FilterBuilder } from "./FilterControls";
import { DynamicFilterBuilder } from "./DynamicFilterBuilder"
import { InteractiveFilterControl } from "../InteractiveFilterControl";
import { StyledControl } from '../ControlWrappers'
import get from "lodash/get";
import set from "lodash/set";

function FilterEditor(props) {
  const { state, setState } = useContext(SymbologyContext);
  const [displayFilterBuilder, setDisplayFilterBuilder] = useState(false);
  const [displayDynamicBuilder, setDisplayDynamicBuilder] = useState(false);
  const [activeFilterColumn, setActiveFilterColumn] = useState();

  const { existingFilter, existingDynamicFilter, layerType, pathBase, filterMode } = useMemo(() => {
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
      pathBase,
      layerType,
      existingFilter: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]${pathBase}['filter']`,
        {}
      ),
      existingDynamicFilter: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]${pathBase}['dynamic-filters']`,
        []
      ),
      sourceId: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}].source_id`
      ),
      filterMode: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]${pathBase}.filterMode`,
        'all'
      )
    }
  }, [state, props])

  return (
    <div className="pb-4 w-full max-h-[calc(100vh_-_251px)] scrollbar-xs overflow-x-hidden overflow-y-auto">
      <div className="w-full mt-1 mx-4 text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center mx">
        Filters
      </div>
      {
        layerType === "interactive" && <div className='px-2'>
          <InteractiveFilterControl path={"['interactive-filters']"} params={{enableBuilder: false}}/>
        </div>
      }
      <div className="flex-1 flex items-center mx-4">
        <div className="pr-1">Mode:</div>
        <StyledControl>
          <label className='flex w-full'>
            <div className='flex w-full items-center'>
              <select
                className='w-full py-2 bg-transparent'
                onChange={(e) => {
                  setState(draft => {
                    set(
                      draft,
                      `symbology.layers[${state.symbology.activeLayer}]${pathBase}.filterMode`,
                      e.target.value
                    );
                  })
                }}
                value={filterMode}
              >
                <option value="all">All</option>
                <option value="any">Any</option>
              </select>
            </div>
          </label>
        </StyledControl>
      </div>
      <div className="mx-4">
        <ExistingFilterList
          removeFilter={(columnName) => {
            setActiveFilterColumn(null);
            setDisplayFilterBuilder(false);
            setState((draft) => {
              if(existingFilter) {
                const newFilter = Object.keys(existingFilter).reduce((a, c) => {
                  if (c !== columnName) {
                    a[c] = existingFilter[c];
                  }
                  return a;
                }, {});
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${pathBase}.filter`,
                  newFilter
                );
              }
              else {
                set(
                  draft,
                  `symbology.layers[${state.symbology.activeLayer}]${pathBase}.filter`,
                  {}
                );
              }

            });
          }}
          activeColumn={activeFilterColumn}
          setActiveColumn={setActiveFilterColumn}
        />
      </div>
      <div className="m-4 mt-2">
        <Button
          className="p-1"
          themeOptions={{ size: "sm", color: "transparent" }}
          onClick={() => {
            setDisplayFilterBuilder(true);
            setDisplayDynamicBuilder(false);
            setActiveFilterColumn(null);
          }}
        >
          Add Filter
        </Button>
      </div>
      {(activeFilterColumn || displayFilterBuilder) && (
        <FilterBuilder
          path={`${pathBase}['filter']`}
          params={{ activeColumn: activeFilterColumn, setActiveColumn: setActiveFilterColumn }}
        />
      )}
      <div className="w-full mt-1 mx-4 text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center mx">
        Dynamic Filters
      </div>
      <DynamicFilterBuilder 
        path={`${pathBase}['dynamic-filters']`}
      />
    </div>
  );
}

export default FilterEditor;
