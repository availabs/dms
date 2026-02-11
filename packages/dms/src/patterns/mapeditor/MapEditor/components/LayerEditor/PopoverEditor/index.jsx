import React, { useContext, useMemo } from "react";
import { SymbologyContext } from "../../../";
import { SelectControl } from "../Controls";
import {ColumnSelectControl} from "./PopoverControls";
import { StyledControl } from "../ControlWrappers";
import { InteractiveFilterControl } from "../InteractiveFilterControl";
import get from 'lodash/get'

function PopoverEditor(props) {
  const { state, setState } = useContext(SymbologyContext);

  const { layerType, selectedInteractiveFilterIndex } = useMemo(() => {
    return {
      selectedInteractiveFilterIndex: get(
        state,
        `symbology.layers[${state.symbology.activeLayer}]['selectedInteractiveFilterIndex']`
      ),
      layerType: get(state, `symbology.layers[${state.symbology.activeLayer}]['layer-type']`, 'fill'),
    }
  },[state])

  let layerPath = ``;
  if (layerType === "interactive") {
    layerPath = `['interactive-filters'][${selectedInteractiveFilterIndex}]`;
  }

  const { activeLayer } = useMemo(() => {
    const path =
      layerPath !== ""
        ? `symbology.layers[${state.symbology.activeLayer}].${layerPath}`
        : `symbology.layers[${state.symbology.activeLayer}]`;
    return {
      activeLayer: get(state, path),
    };
  }, [state]);

  return (
    activeLayer && (
      <div className='pb-4  max-h-[calc(100vh_-_251px)] scrollbar-xs overflow-x-hidden overflow-y-auto'>
        <div className='flex flex-col mx-4 mt-1'>
          <div className='w-full text-slate-500 text-[14px] tracking-wide min-h-[32px] flex items-center'>
            Popover
          </div>
          {layerType === 'interactive' && <div className='w-full'>
          <InteractiveFilterControl path={"['interactive-filters']"} params={{enableBuilder: false}}/>
          </div>}
          <div className='flex-1 flex items-center w-full'>
            <StyledControl>
              <SelectControl
                path={`['hover']`}
                params={{
                  version: layerType === 'interactive' ? 'interactive' : undefined,
                  pathPrefix: layerPath,
                  options: [
                    { value: '', name: 'None' },
                    { value: 'hover', name: 'Hover' },
                  ],
                }}
              />
            </StyledControl>
          </div>
        </div>
        {activeLayer.hover && (
          <ColumnSelectControl
            path={`['hover-columns']`}
            params={{
              version: layerType === 'interactive' ? 'interactive' : undefined,
              pathPrefix: layerPath
            }}
          />
        )}
      </div>
    )
  );
}

export default PopoverEditor;
